package finance_handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

type Entry struct {
	ID          string     `db:"id" json:"id"`
	CreatedBy   string     `db:"created_by" json:"created_by"`
	Mode        string     `db:"mode" json:"mode"`
	Category    string     `db:"category" json:"category"`
	Description string     `db:"description" json:"description"`
	Amount      int64      `db:"amount" json:"amount"`
	OccurredAt  time.Time  `db:"occurred_at" json:"occurred_at"`
	DeletedAt   *time.Time `db:"deleted_at" json:"deleted_at,omitempty"`
}

func List(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot view store finances.")
	}
	trash := c.Query("trash") == "true"
	if trash && !auth_handler.IsSuperadmin(c) {
		return render.Failure(c, 403, "store_access_denied", "You cannot view deleted records.")
	}
	from, to, err := dates(c)
	if err != nil {
		return render.Failure(c, 400, "invalid_dates", err.Error())
	}
	entries := []Entry{}
	err = datastore.Get().Db.Select(&entries, `SELECT id,created_by,mode,category,description,amount,occurred_at,deleted_at FROM finance_entries WHERE store_id=$1 AND (deleted_at IS NOT NULL)=$2 AND occurred_at >= $3 AND occurred_at < $4 ORDER BY occurred_at DESC,id LIMIT 5000`, storeID, trash, from, to)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load income and expenses.")
	}
	return render.Response(c, 200, entries)
}

func Save(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot record store finances.")
	}
	var input Entry
	if c.Bind().Body(&input) != nil {
		return render.Failure(c, 400, "invalid_entry", "Check the record.")
	}
	input.Category = strings.TrimSpace(input.Category)
	input.Description = strings.TrimSpace(input.Description)
	if _, err := uuid.Parse(input.ID); err != nil {
		return render.Failure(c, 400, "invalid_entry", "Record ID is invalid.")
	}
	if input.CreatedBy != c.Locals("user_id").(string) {
		return render.Failure(c, 403, "store_access_denied", "Sign in as the user who recorded this entry.")
	}
	if (input.Mode != "income" && input.Mode != "expense") || len(input.Category) < 1 || len(input.Category) > 80 || len(input.Description) < 1 || len(input.Description) > 1000 || input.Amount < 1 || input.Amount > 1_000_000_000_000 || input.OccurredAt.IsZero() || input.OccurredAt.After(time.Now().Add(5*time.Minute)) {
		return render.Failure(c, 400, "invalid_entry", "Add a category, description, date, and positive IDR amount.")
	}
	var id string
	err := datastore.Get().Db.Get(&id, `INSERT INTO finance_entries(id,store_id,created_by,mode,category,description,amount,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id`, input.ID, storeID, input.CreatedBy, input.Mode, input.Category, input.Description, input.Amount, input.OccurredAt)
	if errors.Is(err, sql.ErrNoRows) {
		err = datastore.Get().Db.Get(&id, `SELECT id FROM finance_entries WHERE id=$1 AND store_id=$2 AND created_by=$3 AND mode=$4 AND category=$5 AND description=$6 AND amount=$7 AND occurred_at=$8`, input.ID, storeID, input.CreatedBy, input.Mode, input.Category, input.Description, input.Amount, input.OccurredAt)
		if err != nil {
			return render.Failure(c, 409, "entry_conflict", "Record ID is already in use.")
		}
	} else if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save the record.")
	}
	return render.Response(c, 200, fiber.Map{"id": id, "synced": true})
}

func Delete(c fiber.Ctx) error  { return changeDeleted(c, true) }
func Restore(c fiber.Ctx) error { return changeDeleted(c, false) }
func changeDeleted(c fiber.Ctx, deleted bool) error {
	storeID := c.Params("store_id")
	role := auth_handler.StoreRole(c, storeID)
	if role == "" || (!deleted && !auth_handler.IsSuperadmin(c)) || (deleted && role != "owner" && role != "admin" && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "store_access_denied", "You cannot delete or restore this record.")
	}
	id := c.Params("entry_id")
	if _, err := uuid.Parse(id); err != nil {
		return render.Failure(c, 400, "invalid_entry", "Record ID is invalid.")
	}
	result, err := datastore.Get().Db.Exec(`UPDATE finance_entries SET deleted_at=CASE WHEN $1 THEN now() ELSE NULL END,deleted_by=CASE WHEN $1 THEN $2::uuid ELSE NULL END WHERE id=$3 AND store_id=$4 AND (deleted_at IS NULL)=$1`, deleted, c.Locals("user_id"), id, storeID)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change the record.")
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return render.Failure(c, 404, "entry_not_found", "Record was not found.")
	}
	return render.Response(c, 200, fiber.Map{"deleted": deleted})
}

// Store reports use one time zone so all devices group records into the same day.
var zone = time.FixedZone("Asia/Jakarta", 7*60*60)

func dates(c fiber.Ctx) (time.Time, time.Time, error) {
	today := time.Now().In(zone)
	from, err := time.ParseInLocation("2006-01-02", c.Query("from", today.AddDate(0, 0, -29).Format("2006-01-02")), zone)
	if err != nil {
		return from, from, errors.New("Use a valid start date.")
	}
	to, err := time.ParseInLocation("2006-01-02", c.Query("to", today.Format("2006-01-02")), zone)
	if err != nil || to.Before(from) || to.Sub(from) > 365*24*time.Hour || to.Format("2006-01-02") > today.Format("2006-01-02") {
		return from, to, errors.New("Select up to 366 days, ending today or earlier.")
	}
	return from, to.AddDate(0, 0, 1), nil
}

type Hour struct {
	Date         string          `db:"date" json:"date"`
	Hour         int             `db:"hour" json:"hour"`
	Units        float64         `db:"units" json:"units"`
	Orders       int64           `db:"orders" json:"orders"`
	Revenue      int64           `db:"revenue" json:"revenue"`
	Tax          int64           `db:"tax" json:"tax"`
	Cost         int64           `db:"cost" json:"cost"`
	Income       int64           `db:"income" json:"income"`
	Expense      int64           `db:"expense" json:"expense"`
	MissingCosts int64           `db:"missing_costs" json:"missing_costs"`
	IDs          json.RawMessage `db:"ids" json:"ids"`
}

func Report(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot view store reports.")
	}
	from, to, err := dates(c)
	if err != nil {
		return render.Failure(c, 400, "invalid_dates", err.Error())
	}
	today := to.AddDate(0, 0, -1)
	weekday := (int(today.Weekday()) + 6) % 7
	compareFrom := today.AddDate(0, 0, -weekday-21)
	if compareFrom.Before(from) {
		from = compareFrom
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load the report.")
	}
	defer tx.Rollback()
	generatedAt := time.Now()
	hours := []Hour{}
	err = tx.Select(&hours, `WITH records AS (
 SELECT s.id,s.completed_at AS occurred_at,1::bigint AS orders,s.subtotal AS revenue,s.tax_total AS tax,
 COALESCE((SELECT SUM(i.quantity*i.unit_cost)::bigint FROM sale_items i WHERE i.sale_id=s.id),0) AS cost,
 COALESCE((SELECT SUM(i.quantity) FROM sale_items i WHERE i.sale_id=s.id),0) AS units,
 0::bigint AS income,0::bigint AS expense,
 (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id=s.id AND NOT i.cost_configured) AS missing_costs
 FROM sales s WHERE s.store_id=$1 AND s.deleted_at IS NULL AND s.completed_at >= $2 AND s.completed_at < $3
 UNION ALL
 SELECT id,occurred_at,0,0,0,0,0,CASE WHEN mode='income' THEN amount ELSE 0 END,CASE WHEN mode='expense' THEN amount ELSE 0 END,0
 FROM finance_entries WHERE store_id=$1 AND deleted_at IS NULL AND occurred_at >= $2 AND occurred_at < $3
 ) SELECT to_char(occurred_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS date,
 EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Asia/Jakarta')::integer AS hour,
 SUM(units)::double precision AS units,SUM(orders)::bigint AS orders,SUM(revenue)::bigint AS revenue,SUM(tax)::bigint AS tax,SUM(cost)::bigint AS cost,
 SUM(income)::bigint AS income,SUM(expense)::bigint AS expense,SUM(missing_costs)::bigint AS missing_costs,jsonb_agg(id) AS ids
 FROM records GROUP BY date,hour ORDER BY date,hour`, storeID, from, to)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load the report.")
	}
	type ProductHour struct {
		Date         string  `db:"date" json:"date"`
		Hour         int     `db:"hour" json:"hour"`
		ProductID    string  `db:"product_id" json:"product_id"`
		Name         string  `db:"name" json:"name"`
		SKU          string  `db:"sku" json:"sku"`
		Units        float64 `db:"units" json:"units"`
		Revenue      int64   `db:"revenue" json:"revenue"`
		Cost         int64   `db:"cost" json:"cost"`
		MissingCosts int64   `db:"missing_costs" json:"missing_costs"`
	}
	products := []ProductHour{}
	err = tx.Select(&products, `SELECT to_char(s.completed_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS date,
 EXTRACT(HOUR FROM s.completed_at AT TIME ZONE 'Asia/Jakarta')::integer AS hour,
 i.product_id,MAX(i.product_name) AS name,MAX(i.sku) AS sku,SUM(i.quantity)::double precision AS units,
 SUM(i.line_total)::bigint AS revenue,SUM(i.quantity*i.unit_cost)::bigint AS cost,
 COUNT(*) FILTER (WHERE NOT i.cost_configured) AS missing_costs
 FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.store_id=$1 AND s.deleted_at IS NULL AND s.completed_at >= $2 AND s.completed_at < $3
 GROUP BY date,hour,i.product_id ORDER BY date,hour,i.product_id`, storeID, from, to)
	if err != nil || tx.Commit() != nil {
		return render.Failure(c, 500, "database_error", "Could not load product sales.")
	}
	return render.Response(c, 200, fiber.Map{"timezone": "Asia/Jakarta", "hours": hours, "products": products, "generated_at": generatedAt})
}
