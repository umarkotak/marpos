package sale_handler

import (
	"github.com/jmoiron/sqlx/types"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/audit"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

type HistorySale struct {
	buyerInput
	Revision      int64      `db:"revision" json:"revision"`
	ID            string     `db:"id" json:"id"`
	OrderNumber   int64      `db:"order_number" json:"order_number"`
	Reference     string     `db:"reference" json:"reference"`
	ReceiptNumber string     `db:"receipt_number" json:"receipt_number"`
	CashierName   string     `db:"cashier_name" json:"cashier_name"`
	Subtotal      int64      `db:"subtotal" json:"subtotal"`
	TaxApplied    bool       `db:"tax_applied" json:"tax_applied"`
	TaxPercentage float64    `db:"tax_percentage" json:"tax_percentage"`
	TaxTotal      int64      `db:"tax_total" json:"tax_total"`
	GrandTotal    int64      `db:"grand_total" json:"grand_total"`
	CompletedAt   time.Time  `db:"completed_at" json:"completed_at"`
	DeletedAt     *time.Time `db:"deleted_at" json:"deleted_at,omitempty"`
}

func History(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	role := auth_handler.StoreRole(c, storeID)
	if role == "" {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	trash := c.Query("trash") == "true"
	if trash && !auth_handler.IsSuperadmin(c) {
		return render.Failure(c, 403, "store_access_denied", "You cannot view deleted orders.")
	}
	const limit = 50
	offset, err := strconv.Atoi(c.Query("offset", "0"))
	if err != nil || offset < 0 || offset > 100000 {
		return render.Failure(c, 400, "invalid_offset", "Check the order page.")
	}
	items := []HistorySale{}
	err = datastore.Get().Db.Select(&items, `SELECT s.id,s.order_number,s.reference,s.receipt_number,u.name AS cashier_name,s.subtotal,s.tax_applied,s.tax_percentage,s.tax_total,s.grand_total,s.completed_at,s.deleted_at,s.buyer_name,s.buyer_phone,s.buyer_email,s.revision
        FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.store_id=$1 AND (s.deleted_at IS NOT NULL)=$2
        ORDER BY s.completed_at DESC,s.id DESC LIMIT $3 OFFSET $4`, storeID, trash, limit, offset)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load orders.")
	}
	return render.Response(c, 200, items)
}

func Detail(c fiber.Ctx) error {
	storeID, saleID := c.Params("store_id"), c.Params("sale_id")
	if auth_handler.StoreRole(c, storeID) == "" {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	if _, err := uuid.Parse(saleID); err != nil {
		return render.Failure(c, 400, "invalid_order", "Order ID is invalid.")
	}
	var sale HistorySale
	err := datastore.Get().Db.Get(&sale, `SELECT s.id,s.order_number,s.reference,s.receipt_number,u.name AS cashier_name,s.subtotal,s.tax_applied,s.tax_percentage,s.tax_total,s.grand_total,s.completed_at,s.deleted_at,s.buyer_name,s.buyer_phone,s.buyer_email,s.revision
        FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.store_id=$1 AND s.id=$2 AND (s.deleted_at IS NULL OR $3)`, storeID, saleID, auth_handler.IsSuperadmin(c))
	if err != nil {
		return render.Failure(c, 404, "order_not_found", "Order was not found.")
	}
	type Item struct {
		ID             string         `db:"id" json:"id"`
		ProductID      string         `db:"product_id" json:"product_id"`
		ProductName    string         `db:"product_name" json:"product_name"`
		SKU            string         `db:"sku" json:"sku"`
		Quantity       float64        `db:"quantity" json:"quantity"`
		UnitPrice      int64          `db:"unit_price" json:"unit_price"`
		LineTotal      int64          `db:"line_total" json:"line_total"`
		UnitCost       int64          `db:"unit_cost" json:"unit_cost"`
		CostConfigured bool           `db:"cost_configured" json:"cost_configured"`
		Costs          types.JSONText `db:"cost_breakdown" json:"cost_breakdown"`
		Addons         []addonInput   `json:"addons"`
	}
	items := []Item{}
	err = datastore.Get().Db.Select(&items, `SELECT id,product_id,product_name,sku,quantity,unit_price,line_total,unit_cost,cost_configured,cost_breakdown FROM sale_items WHERE sale_id=$1 ORDER BY created_at,id`, saleID)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load order.")
	}
	for i := range items {
		items[i].Addons = []addonInput{}
		if err = datastore.Get().Db.Select(&items[i].Addons, `SELECT id,option_id,group_name,option_name,price_delta FROM sale_item_addons WHERE sale_item_id=$1 ORDER BY option_name`, items[i].ID); err != nil {
			return render.Failure(c, 500, "database_error", "Could not load order.")
		}
	}
	history, err := audit.History(datastore.Get().Db, storeID, "sale", saleID)
	if err != nil {
		return render.Failure(c, 500, "audit_error", "Could not load order history.")
	}
	return render.Response(c, 200, fiber.Map{"sale": sale, "items": items, "history": history})
}

func Delete(c fiber.Ctx) error  { return changeDeleted(c, true) }
func Restore(c fiber.Ctx) error { return changeDeleted(c, false) }

func changeDeleted(c fiber.Ctx, deleted bool) error {
	storeID, saleID := c.Params("store_id"), c.Params("sale_id")
	role := auth_handler.StoreRole(c, storeID)
	if role == "" || (!deleted && !auth_handler.IsSuperadmin(c)) || (deleted && role != "owner" && role != "admin" && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "store_access_denied", "You cannot change orders.")
	}
	if _, err := uuid.Parse(saleID); err != nil {
		return render.Failure(c, 400, "invalid_order", "Order ID is invalid.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change order.")
	}
	defer tx.Rollback()
	var result interface{ RowsAffected() (int64, error) }
	if deleted {
		result, err = tx.Exec(`UPDATE sales SET deleted_at=now(),deleted_by=$1 WHERE id=$2 AND store_id=$3 AND deleted_at IS NULL`, c.Locals("user_id"), saleID, storeID)
	} else {
		result, err = tx.Exec(`UPDATE sales SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND store_id=$2 AND deleted_at IS NOT NULL`, saleID, storeID)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change order.")
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return render.Failure(c, 404, "order_not_found", "Order was not found.")
	}
	action := "sale.deleted"
	if !deleted {
		action = "sale.restored"
	}
	if err = audit.Write(tx, storeID, c.Locals("user_id").(string), action, "sale", saleID, map[string]interface{}{"deleted": deleted}); err != nil {
		return render.Failure(c, 500, "audit_error", "Could not record the order action.")
	}
	if tx.Commit() != nil {
		return render.Failure(c, 500, "database_error", "Could not change order.")
	}
	return render.Response(c, 200, fiber.Map{"deleted": deleted})
}
