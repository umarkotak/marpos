package product_handler

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

func validDescription(value string) bool {
	if utf8.RuneCountInString(value) > 2000 {
		return false
	}
	for _, char := range value {
		if unicode.IsControl(char) && char != '\n' && char != '\r' && char != '\t' {
			return false
		}
	}
	return true
}

func AdHoc(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if auth_handler.StoreRole(c, storeID) == "" {
		return render.Failure(c, 403, "store_access_denied", "You cannot add products in this store.")
	}
	var input struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Price       int64  `json:"price"`
	}
	if c.Bind().Body(&input) != nil {
		return render.Failure(c, 400, "invalid_product", "Check the ad hoc product.")
	}
	input.Name, input.Description = strings.TrimSpace(input.Name), strings.TrimSpace(input.Description)
	_, idErr := uuid.Parse(input.ID)
	validName := input.Name != "" && utf8.RuneCountInString(input.Name) <= 200
	for _, char := range input.Name {
		if unicode.IsControl(char) {
			validName = false
		}
	}
	if idErr != nil || !validName || !validDescription(input.Description) || input.Price < 0 || input.Price > 1_000_000_000_000 {
		return render.Failure(c, 400, "invalid_product", "Check the ad hoc product.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO products(id,store_id,sku,name,description,category) VALUES($1,$2,$3,$4,$5,'ad hoc') ON CONFLICT(id) DO NOTHING`, input.ID, storeID, "ADHOC-"+input.ID, input.Name, input.Description)
	if err != nil {
		return render.Failure(c, 409, "product_conflict", "Could not save the ad hoc product.")
	}
	count, err := result.RowsAffected()
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	if count == 0 {
		var exists bool
		if tx.Get(&exists, `SELECT EXISTS(SELECT 1 FROM products WHERE id=$1 AND store_id=$2)`, input.ID, storeID) != nil || !exists {
			return render.Failure(c, 409, "product_conflict", "Could not save the ad hoc product.")
		}
	} else {
		if _, err = tx.Exec(`INSERT INTO product_prices(product_id,amount) VALUES($1,$2)`, input.ID, input.Price); err != nil {
			return render.Failure(c, 500, "database_error", "Could not save product.")
		}
		var sequence int64
		if err = tx.Get(&sequence, `UPDATE stores SET sync_version=sync_version+1 WHERE id=$1 RETURNING sync_version`, storeID); err == nil {
			_, err = tx.Exec(`INSERT INTO sync_changes(store_id,sequence,entity_type,entity_id,operation,payload) VALUES($1,$2,'product',$3,'created',jsonb_build_object('id',$3::uuid::text))`, storeID, sequence, input.ID)
		}
		if err != nil {
			return render.Failure(c, 500, "database_error", "Could not save product.")
		}
	}
	if tx.Commit() != nil {
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	return render.Response(c, 200, fiber.Map{"id": input.ID})
}
