package store_handler

import (
	"math"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

func SaveSettings(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot change this store.")
	}
	var input struct {
		Name          string  `json:"name"`
		TaxPercentage float64 `json:"tax_percentage"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_request", "Check the store settings.")
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 100 || math.IsNaN(input.TaxPercentage) || input.TaxPercentage < 0 || input.TaxPercentage > 100 || math.Abs(math.Round(input.TaxPercentage*100)-input.TaxPercentage*100) > 0.000001 {
		return render.Failure(c, 400, "invalid_settings", "Add a store name and a tax percentage from 0 to 100.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	defer tx.Rollback()
	_, err = tx.Exec(`UPDATE stores SET name=$1,tax_percentage=$2,updated_at=now() WHERE id=$3`, input.Name, input.TaxPercentage, storeID)
	if err != nil {
		return render.Failure(c, 409, "store_conflict", "Store name is already in use.")
	}
	var sequence int64
	if err = tx.Get(&sequence, `UPDATE stores SET sync_version=sync_version+1 WHERE id=$1 RETURNING sync_version`, storeID); err == nil {
		_, err = tx.Exec(`INSERT INTO sync_changes (store_id,sequence,entity_type,entity_id,operation,payload)
			VALUES ($1,$2,'store',$1,'updated',jsonb_build_object('name',$3::text,'tax_percentage',$4::numeric))`, storeID, sequence, input.Name, input.TaxPercentage)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	return render.Response(c, 200, fiber.Map{"name": input.Name, "tax_percentage": input.TaxPercentage})
}
