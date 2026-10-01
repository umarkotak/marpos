package sale_handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/umarkotak/marpos/apps/api/audit"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

const maxSale = int64(1_000_000_000_000)

type addonInput struct {
	ID         string `db:"id" json:"id"`
	OptionID   string `db:"option_id" json:"option_id"`
	GroupName  string `db:"group_name" json:"group_name"`
	OptionName string `db:"option_name" json:"option_name"`
	PriceDelta int64  `db:"price_delta" json:"price_delta"`
}

type costInput struct {
	Name   string `db:"name" json:"name"`
	Amount int64  `db:"amount" json:"amount"`
}

type itemInput struct {
	ID             string       `db:"id" json:"id"`
	ProductID      string       `db:"product_id" json:"product_id"`
	ProductName    string       `db:"product_name" json:"product_name"`
	SKU            string       `db:"sku" json:"sku"`
	Quantity       int64        `db:"quantity" json:"quantity"`
	UnitPrice      int64        `db:"unit_price" json:"unit_price"`
	LineTotal      int64        `db:"line_total" json:"line_total"`
	Addons         []addonInput `db:"addons" json:"addons"`
	UnitCost       int64        `db:"unit_cost" json:"unit_cost"`
	CostConfigured bool         `db:"cost_configured" json:"cost_configured"`
	Costs          []costInput  `db:"cost_breakdown" json:"cost_breakdown"`
}

type saleInput struct {
	buyerInput
	OperationID   string      `db:"operation_id" json:"operation_id"`
	DeviceID      string      `db:"device_id" json:"device_id"`
	ID            string      `db:"id" json:"id"`
	RegisterID    string      `db:"register_id" json:"register_id"`
	CashierID     string      `db:"cashier_id" json:"cashier_id"`
	ReceiptNumber string      `db:"receipt_number" json:"receipt_number"`
	CreatedAt     time.Time   `db:"created_at" json:"created_at"`
	CompletedAt   time.Time   `db:"completed_at" json:"completed_at"`
	TaxApplied    bool        `db:"tax_applied" json:"tax_applied"`
	TaxPercentage float64     `db:"tax_percentage" json:"tax_percentage"`
	Subtotal      int64       `db:"subtotal" json:"subtotal"`
	TaxTotal      int64       `db:"tax_total" json:"tax_total"`
	GrandTotal    int64       `db:"grand_total" json:"grand_total"`
	Items         []itemInput `db:"items" json:"items"`
}

func Sync(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, false) {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	var sale saleInput
	if err := c.Bind().Body(&sale); err != nil {
		return render.Failure(c, 400, "invalid_sale", "Check the sale data.")
	}
	if err := validateSale(&sale); err != nil {
		return render.Failure(c, 400, "invalid_sale", err.Error())
	}
	subtotal, tax := sale.Subtotal, sale.TaxTotal

	db := datastore.Get().Db
	tx, err := db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not sync sale.")
	}
	defer tx.Rollback()
	var clearedAt sql.NullTime
	if err = tx.Get(&clearedAt, `SELECT orders_cleared_at FROM stores WHERE id=$1 FOR UPDATE`, storeID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not sync sale.")
	}
	if clearedAt.Valid && !sale.CompletedAt.After(clearedAt.Time) {
		return render.Failure(c, 409, "sale_cleared", "This sale was made before the store orders were cleared.")
	}
	var registered bool
	err = tx.Get(&registered, `SELECT EXISTS(SELECT 1 FROM sync_devices d JOIN user_store_roles usr ON usr.store_id=d.store_id AND usr.user_id=$4
		WHERE d.id=$1 AND d.store_id=$2 AND d.register_id=$3 AND d.revoked_at IS NULL)`, sale.DeviceID, storeID, sale.RegisterID, sale.CashierID)
	if err != nil || !registered {
		return render.Failure(c, 403, "device_not_registered", "Sign in on this register before checkout.")
	}
	var inserted string
	err = tx.Get(&inserted, `INSERT INTO sync_operations (id,store_id,device_id,operation_type,entity_id)
		VALUES ($1,$2,$3,'sale.created',$4) ON CONFLICT (id) DO NOTHING RETURNING id`, sale.OperationID, storeID, sale.DeviceID, sale.ID)
	if errors.Is(err, sql.ErrNoRows) {
		var existing struct {
			ID          string `db:"id"`
			OrderNumber int64  `db:"order_number"`
			Reference   string `db:"reference"`
		}
		if err = tx.Get(&existing, `SELECT s.id,s.order_number,s.reference FROM sync_operations so JOIN sales s ON s.id=so.entity_id
			WHERE so.id=$1 AND so.store_id=$2 AND so.device_id=$3 AND so.operation_type='sale.created'`, sale.OperationID, storeID, sale.DeviceID); err != nil || existing.ID != sale.ID {
			return render.Failure(c, 409, "sync_conflict", "Sale sync ID is already in use.")
		}
		return render.Response(c, 200, fiber.Map{"id": sale.ID, "synced": true, "order_number": existing.OrderNumber, "reference": existing.Reference})
	}
	if err != nil {
		return render.Failure(c, 409, "sync_conflict", "Sale sync ID is already in use.")
	}
	orderYear := sale.CompletedAt.In(time.FixedZone("WIB", 7*60*60)).Year()
	var orderNumber int64
	if err = tx.Get(&orderNumber, `INSERT INTO store_order_counters (store_id,order_year,next_order_number)
		VALUES ($1,$2,2) ON CONFLICT (store_id,order_year) DO UPDATE
		SET next_order_number=store_order_counters.next_order_number+1
		RETURNING next_order_number-1`, storeID, orderYear); err != nil {
		return render.Failure(c, 500, "database_error", "Could not assign an order number.")
	}
	reference := fmt.Sprintf("MP-%d-%05d", orderYear, orderNumber)
	_, err = tx.Exec(`INSERT INTO sales (id,store_id,register_id,cashier_id,receipt_number,order_year,order_number,reference,subtotal,tax_applied,tax_percentage,tax_total,grand_total,created_at,completed_at,buyer_name,buyer_phone,buyer_email)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, sale.ID, storeID, sale.RegisterID, sale.CashierID, sale.ReceiptNumber, orderYear, orderNumber, reference, subtotal, sale.TaxApplied, sale.TaxPercentage, tax, sale.GrandTotal, sale.CreatedAt, sale.CompletedAt, sale.BuyerName, sale.BuyerPhone, sale.BuyerEmail)
	if err != nil {
		return render.Failure(c, 409, "sale_conflict", "Sale ID or receipt number is already in use.")
	}
	if err = writeItems(tx, storeID, &sale); err != nil {
		return render.Failure(c, 400, "invalid_items", err.Error())
	}
	if sale.GrandTotal > 0 {
		_, err = tx.Exec(`INSERT INTO payments (id,sale_id,payment_method,amount) VALUES ($1,$2,'cash',$3)`, uuid.NewString(), sale.ID, sale.GrandTotal)
		if err != nil {
			return render.Failure(c, 500, "database_error", "Could not save payment.")
		}
	}
	if err = audit.Write(tx, storeID, sale.CashierID, "sale.created", "sale", sale.ID, map[string]interface{}{"reference": reference, "completed_at": sale.CompletedAt, "synced_by": c.Locals("user_id"), "grand_total": sale.GrandTotal}); err != nil {
		return render.Failure(c, 500, "audit_error", "Could not record the order action.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not sync sale.")
	}
	return render.Response(c, 200, fiber.Map{"id": sale.ID, "synced": true, "order_number": orderNumber, "reference": reference})
}

func validateSale(sale *saleInput) error {
	if err := sale.buyerInput.validate(); err != nil {
		return err
	}
	for _, id := range []string{sale.OperationID, sale.DeviceID, sale.ID, sale.RegisterID, sale.CashierID} {
		if _, err := uuid.Parse(id); err != nil {
			return errors.New("Sale IDs are invalid.")
		}
	}
	if sale.ReceiptNumber == "" || len(sale.Items) == 0 || sale.CreatedAt.IsZero() || sale.CompletedAt.IsZero() || sale.CompletedAt.Before(sale.CreatedAt) || sale.CompletedAt.After(time.Now().Add(5*time.Minute)) {
		return errors.New("Check the sale details.")
	}
	if math.IsNaN(sale.TaxPercentage) || sale.TaxPercentage < 0 || sale.TaxPercentage > 100 || math.Abs(math.Round(sale.TaxPercentage*100)-sale.TaxPercentage*100) > 0.000001 {
		return errors.New("Tax percentage is invalid.")
	}
	var subtotal, productionCost int64
	for _, item := range sale.Items {
		if _, err := uuid.Parse(item.ID); err != nil {
			return errors.New("Sale item ID is invalid.")
		}
		if _, err := uuid.Parse(item.ProductID); err != nil {
			return errors.New("Product ID is invalid.")
		}
		if item.Quantity < 1 || item.Quantity > 1000 || item.UnitPrice < 0 || item.UnitPrice > maxSale || item.ProductName == "" || item.SKU == "" {
			return errors.New("Check the sale item.")
		}
		var costTotal int64
		if len(item.Costs) > 200 {
			return errors.New("Too many cost items.")
		}
		for _, cost := range item.Costs {
			if strings.TrimSpace(cost.Name) == "" || len(cost.Name) > 200 || cost.Amount < 0 || cost.Amount > maxSale-costTotal {
				return errors.New("Check the saved product costs.")
			}
			costTotal += cost.Amount
		}
		if item.UnitCost != costTotal || item.UnitCost < 0 || item.UnitCost > maxSale/item.Quantity || (!item.CostConfigured && item.UnitCost != 0) {
			return errors.New("Product cost does not match its breakdown.")
		}
		lineCost := item.UnitCost * item.Quantity
		if productionCost > maxSale-lineCost {
			return errors.New("Sale production cost is too large.")
		}
		productionCost += lineCost
		unit := item.UnitPrice
		seen := map[string]bool{}
		for _, addon := range item.Addons {
			if _, err := uuid.Parse(addon.ID); err != nil {
				return errors.New("Add-on ID is invalid.")
			}
			if _, err := uuid.Parse(addon.OptionID); err != nil {
				return errors.New("Add-on option ID is invalid.")
			}
			if seen[addon.OptionID] || addon.PriceDelta < 0 || addon.PriceDelta > maxSale || unit > maxSale-addon.PriceDelta || addon.GroupName == "" || addon.OptionName == "" {
				return errors.New("Check the selected add-ons.")
			}
			seen[addon.OptionID] = true
			unit += addon.PriceDelta
		}
		line := unit * item.Quantity
		if unit > maxSale/item.Quantity || line != item.LineTotal || line > maxSale || subtotal > maxSale-line {
			return errors.New("Sale total does not match its items.")
		}
		subtotal += line
	}
	taxBasisPoints := int64(math.Round(sale.TaxPercentage * 100))
	if !sale.TaxApplied {
		taxBasisPoints = 0
	}
	tax := (subtotal*taxBasisPoints + 5000) / 10000
	if sale.Subtotal != subtotal || sale.TaxTotal != tax || sale.GrandTotal != subtotal+tax {
		return errors.New("Sale total does not match its tax.")
	}

	return nil
}
func writeItems(tx *sqlx.Tx, storeID string, sale *saleInput) error {
	var err error
	for _, item := range sale.Items {
		if item.Costs == nil {
			item.Costs = []costInput{}
		}
		costs, _ := json.Marshal(item.Costs)
		_, err = tx.Exec(`INSERT INTO sale_items (id,store_id,sale_id,product_id,product_name,sku,quantity,unit_price,line_total,unit_cost,cost_configured,cost_breakdown)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, item.ID, storeID, sale.ID, item.ProductID, item.ProductName, item.SKU, item.Quantity, item.UnitPrice, item.LineTotal, item.UnitCost, item.CostConfigured, string(costs))
		if err != nil {
			return errors.New("Sale item is invalid.")
		}
		chosenGroups := map[string]int{}
		for _, addon := range item.Addons {
			var details struct {
				GroupID string `db:"group_id"`
				Mode    string `db:"selection_mode"`
			}
			err = tx.Get(&details, `SELECT g.id AS group_id, g.selection_mode FROM addon_options o JOIN addon_groups g ON g.id=o.group_id
				WHERE o.id=$1 AND g.product_id=$2 AND g.store_id=$3`, addon.OptionID, item.ProductID, storeID)
			if err != nil {
				return errors.New("An add-on does not belong to this product.")
			}
			chosenGroups[details.GroupID]++
			if details.Mode == "single" && chosenGroups[details.GroupID] > 1 {
				return errors.New("Select one option from each single-choice group.")
			}
			_, err = tx.Exec(`INSERT INTO sale_item_addons (id,sale_item_id,option_id,group_name,option_name,price_delta)
				VALUES ($1,$2,$3,$4,$5,$6)`, addon.ID, item.ID, addon.OptionID, addon.GroupName, addon.OptionName, addon.PriceDelta)
			if err != nil {
				return errors.New("Selected add-on is invalid.")
			}
		}
	}
	return nil
}
