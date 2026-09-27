package sale_handler

import (
	"encoding/json"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx/types"
	"github.com/umarkotak/marpos/apps/api/audit"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
	"strings"
	"time"
)

func Correct(c fiber.Ctx) error {
	storeID, id := c.Params("store_id"), c.Params("sale_id")
	role := auth_handler.StoreRole(c, storeID)
	if role == "" || (role != "owner" && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "store_access_denied", "Only an owner can edit orders.")
	}
	if _, err := uuid.Parse(id); err != nil {
		return render.Failure(c, 400, "invalid_order", "Order ID is invalid.")
	}
	var input struct {
		saleInput
		Revision      int64  `json:"revision"`
		Reason        string `json:"reason"`
		CashConfirmed bool   `json:"cash_adjustment_confirmed"`
	}
	if c.Bind().Body(&input) != nil {
		return render.Failure(c, 400, "invalid_order", "Check the order data.")
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" || len(input.Reason) > 1000 {
		return render.Failure(c, 400, "invalid_reason", "Enter a correction reason.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction.")
	}
	defer tx.Rollback()
	var old struct {
		RegisterID  string    `db:"register_id"`
		CashierID   string    `db:"cashier_id"`
		CreatedAt   time.Time `db:"created_at"`
		CompletedAt time.Time `db:"completed_at"`
		Receipt     string    `db:"receipt_number"`
		GrandTotal  int64     `db:"grand_total"`
		Revision    int64     `db:"revision"`
	}
	if tx.Get(&old, `SELECT register_id,cashier_id,created_at,completed_at,receipt_number,grand_total,revision FROM sales WHERE store_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, storeID, id) != nil {
		return render.Failure(c, 404, "order_not_found", "Order was not found.")
	}
	if input.Revision != old.Revision {
		return render.Failure(c, 409, "order_changed", "This order changed. Reload it before you edit.")
	}
	sale := input.saleInput
	sale.ID = id
	sale.RegisterID = old.RegisterID
	sale.CashierID = old.CashierID
	sale.CreatedAt = old.CreatedAt
	sale.CompletedAt = old.CompletedAt
	sale.ReceiptNumber = old.Receipt
	sale.DeviceID = uuid.NewString()
	sale.OperationID = uuid.NewString()
	if err = validateSale(&sale); err != nil {
		return render.Failure(c, 400, "invalid_order", err.Error())
	}
	if sale.GrandTotal != old.GrandTotal && !input.CashConfirmed {
		return render.Failure(c, 400, "cash_adjustment_required", "Confirm the cash received or returned for this correction.")
	}
	var before types.JSONText
	if err = tx.Get(&before, `SELECT jsonb_build_object('sale',to_jsonb(s),'items',COALESCE((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('addons',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM sale_item_addons a WHERE a.sale_item_id=i.id),'[]'::jsonb))) FROM sale_items i WHERE i.sale_id=s.id),'[]'::jsonb)) FROM sales s WHERE s.id=$1`, id); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save original order.")
	}
	// Existing returns reference their sale items. Keep those records intact.
	var hasReturn bool
	if tx.Get(&hasReturn, `SELECT EXISTS(SELECT 1 FROM return_items r JOIN sale_items i ON i.id=r.sale_item_id WHERE i.sale_id=$1)`, id) != nil {
		return render.Failure(c, 500, "database_error", "Could not check returns.")
	}
	if hasReturn {
		return render.Failure(c, 409, "order_has_returns", "An order with returns cannot be edited.")
	}
	if _, err = tx.Exec(`DELETE FROM sale_item_addons WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id=$1)`, id); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction.")
	}
	if _, err = tx.Exec(`DELETE FROM sale_items WHERE sale_id=$1`, id); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction.")
	}
	if err = writeItems(tx, storeID, &sale); err != nil {
		return render.Failure(c, 400, "invalid_items", err.Error())
	}
	if _, err = tx.Exec(`UPDATE sales SET buyer_name=$1,buyer_phone=$2,buyer_email=$3,subtotal=$4,tax_applied=$5,tax_percentage=$6,tax_total=$7,grand_total=$8,revision=revision+1 WHERE id=$9`, sale.BuyerName, sale.BuyerPhone, sale.BuyerEmail, sale.Subtotal, sale.TaxApplied, sale.TaxPercentage, sale.TaxTotal, sale.GrandTotal, id); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction.")
	}
	afterJSON, _ := json.Marshal(sale)
	var after map[string]interface{}
	if json.Unmarshal(afterJSON, &after) != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction history.")
	}
	delete(after, "operation_id")
	delete(after, "device_id")
	metadata, _ := json.Marshal(map[string]interface{}{"before": before, "after": after, "reason": input.Reason, "cash_delta": sale.GrandTotal - old.GrandTotal, "revision": old.Revision + 1})
	if err = audit.Write(tx, storeID, c.Locals("user_id").(string), "sale.corrected", "sale", id, json.RawMessage(metadata)); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction history.")
	}
	if tx.Commit() != nil {
		return render.Failure(c, 500, "database_error", "Could not save correction.")
	}
	return render.Response(c, 200, fiber.Map{"revision": old.Revision + 1, "cash_delta": sale.GrandTotal - old.GrandTotal})
}
