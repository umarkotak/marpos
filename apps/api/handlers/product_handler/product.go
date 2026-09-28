package product_handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

type Cost struct {
	Name   string `json:"name"`
	Amount int64  `json:"amount"`
}

type Option struct {
	ID         string `db:"id" json:"id"`
	GroupID    string `db:"group_id" json:"-"`
	Name       string `db:"name" json:"name"`
	PriceDelta int64  `db:"price_delta" json:"price_delta"`
	CostDelta  int64  `db:"cost_delta" json:"cost_delta"`
}

type Group struct {
	ID            string   `db:"id" json:"id"`
	ProductID     string   `db:"product_id" json:"-"`
	Name          string   `db:"name" json:"name"`
	SelectionMode string   `db:"selection_mode" json:"selection_mode"`
	Required      bool     `db:"required" json:"required"`
	Options       []Option `json:"options"`
}

type Product struct {
	ID             string          `db:"id" json:"id"`
	SKU            string          `db:"sku" json:"sku"`
	Barcode        string          `db:"barcode" json:"barcode"`
	Name           string          `db:"name" json:"name"`
	Price          int64           `db:"price" json:"price"`
	Groups         []Group         `json:"addon_groups"`
	CostBreakdown  json.RawMessage `db:"cost_breakdown" json:"cost_breakdown"`
	CostConfigured bool            `db:"cost_configured" json:"cost_configured"`
	ImageURLs      json.RawMessage `db:"image_urls" json:"image_urls"`
}

type optionInput struct {
	Name       string `json:"name"`
	PriceDelta int64  `json:"price_delta"`
	CostDelta  int64  `json:"cost_delta"`
}

type groupInput struct {
	Name          string        `json:"name"`
	SelectionMode string        `json:"selection_mode"`
	Required      bool          `json:"required"`
	Options       []optionInput `json:"options"`
}

type productInput struct {
	SKU       string       `json:"sku"`
	Barcode   string       `json:"barcode"`
	Name      string       `json:"name"`
	Price     int64        `json:"price"`
	Groups    []groupInput `json:"addon_groups"`
	Costs     []Cost       `json:"cost_breakdown"`
	ImageURLs []string     `json:"image_urls"`
}

func List(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	role := auth_handler.StoreRole(c, storeID)
	trash := c.Query("trash") == "true"
	if role == "" || (trash && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	db := datastore.Get().Db
	var products []Product
	err := db.Select(&products, `SELECT p.id, p.sku, COALESCE(p.barcode,'') AS barcode, p.name, pp.amount AS price,p.cost_breakdown,p.cost_configured,p.image_urls
		FROM products p JOIN product_prices pp ON pp.product_id = p.id AND pp.ends_at IS NULL
		WHERE p.store_id = $1 AND (p.deleted_at IS NOT NULL) = $2 AND (p.active=true OR $2) ORDER BY p.name`, storeID, trash)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load products.")
	}
	if products == nil {
		products = []Product{}
	}
	index := make(map[string]int, len(products))
	for i := range products {
		products[i].Groups = []Group{}
		index[products[i].ID] = i
	}
	var groups []Group
	err = db.Select(&groups, `SELECT g.id, g.product_id, g.name, g.selection_mode, g.required
		FROM addon_groups g JOIN products p ON p.id = g.product_id
		WHERE p.store_id = $1 AND (p.deleted_at IS NOT NULL) = $2 AND (p.active=true OR $2) AND g.active = true ORDER BY g.sort_order, g.name`, storeID, trash)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load add-ons.")
	}
	var options []Option
	err = db.Select(&options, `SELECT o.id, o.group_id, o.name, o.price_delta,o.cost_delta FROM addon_options o
		JOIN addon_groups g ON g.id = o.group_id JOIN products p ON p.id = g.product_id
		WHERE p.store_id = $1 AND (p.deleted_at IS NOT NULL) = $2 AND (p.active=true OR $2) AND g.active = true AND o.active = true ORDER BY o.sort_order, o.name`, storeID, trash)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load add-ons.")
	}
	optionGroups := make(map[string][]Option)
	for _, option := range options {
		optionGroups[option.GroupID] = append(optionGroups[option.GroupID], option)
	}
	for _, group := range groups {
		group.Options = optionGroups[group.ID]
		if group.Options == nil {
			group.Options = []Option{}
		}
		if i, ok := index[group.ProductID]; ok {
			products[i].Groups = append(products[i].Groups, group)
		}
	}
	return render.Response(c, 200, products)
}

func Save(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot change products in this store.")
	}
	var input productInput
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_request", "Check the product data.")
	}
	input.SKU, input.Name, input.Barcode = strings.TrimSpace(input.SKU), strings.TrimSpace(input.Name), strings.TrimSpace(input.Barcode)
	if input.SKU == "" || input.Name == "" || input.Price < 0 || input.Price > 1_000_000_000_000 {
		return render.Failure(c, 400, "invalid_product", "Add a name, SKU, and valid price.")
	}
	var costTotal int64
	if len(input.Costs) > 100 {
		return render.Failure(c, 400, "invalid_cost", "Use at most 100 cost items.")
	}
	for i := range input.Costs {
		cost := &input.Costs[i]
		cost.Name = strings.TrimSpace(cost.Name)
		if cost.Name == "" || len(cost.Name) > 100 || cost.Amount < 0 || cost.Amount > 1_000_000_000_000-costTotal {
			return render.Failure(c, 400, "invalid_cost", "Each cost needs a name and a valid IDR amount.")
		}
		costTotal += cost.Amount
	}
	if input.Costs == nil {
		input.Costs = []Cost{}
	}
	if len(input.ImageURLs) > 10 {
		return render.Failure(c, 400, "invalid_image", "Use at most 10 product images.")
	}
	imagePrefix := "/backend/images/" + storeID + "/"
	seenImages := make(map[string]bool, len(input.ImageURLs))
	for _, imageURL := range input.ImageURLs {
		if !strings.HasPrefix(imageURL, imagePrefix) || seenImages[imageURL] {
			return render.Failure(c, 400, "invalid_image", "Choose images uploaded for this store.")
		}
		name := strings.TrimPrefix(imageURL, imagePrefix)
		if !strings.HasSuffix(name, ".avif") {
			return render.Failure(c, 400, "invalid_image", "Choose images uploaded for this store.")
		}
		if _, err := uuid.Parse(strings.TrimSuffix(name, ".avif")); err != nil {
			return render.Failure(c, 400, "invalid_image", "Choose images uploaded for this store.")
		}
		if _, err := os.Stat(filepath.Join(config.Get().StorageDir, storeID, name)); err != nil {
			return render.Failure(c, 400, "invalid_image", "An image is missing from storage.")
		}
		seenImages[imageURL] = true
	}
	if input.ImageURLs == nil {
		input.ImageURLs = []string{}
	}
	images, _ := json.Marshal(input.ImageURLs)
	costs, _ := json.Marshal(input.Costs)
	for i := range input.Groups {
		group := &input.Groups[i]
		group.Name = strings.TrimSpace(group.Name)
		if group.Name == "" || (group.SelectionMode != "single" && group.SelectionMode != "multiple") || len(group.Options) == 0 {
			return render.Failure(c, 400, "invalid_addon_group", "Each add-on group needs a name, choice type, and options.")
		}
		for j := range group.Options {
			group.Options[j].Name = strings.TrimSpace(group.Options[j].Name)
			if group.Options[j].Name == "" || group.Options[j].PriceDelta < 0 || group.Options[j].PriceDelta > 1_000_000_000_000 || group.Options[j].CostDelta < 0 || group.Options[j].CostDelta > 1_000_000_000_000 {
				return render.Failure(c, 400, "invalid_addon_option", "Each add-on needs a name and a valid price increase.")
			}
		}
	}
	db := datastore.Get().Db
	tx, err := db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	defer tx.Rollback()
	productID := c.Params("product_id")
	if productID == "" {
		productID = uuid.NewString()
		_, err = tx.Exec(`INSERT INTO products (id,store_id,sku,barcode,name) VALUES ($1,$2,$3,NULLIF($4,''),$5)`, productID, storeID, input.SKU, input.Barcode, input.Name)
		if err == nil {
			_, err = tx.Exec(`INSERT INTO product_prices (product_id,amount) VALUES ($1,$2)`, productID, input.Price)
		}
	} else {
		if _, parseErr := uuid.Parse(productID); parseErr != nil {
			return render.Failure(c, 400, "invalid_product", "Product ID is invalid.")
		}
		var oldPrice int64
		err = tx.Get(&oldPrice, `SELECT pp.amount FROM products p JOIN product_prices pp ON pp.product_id=p.id AND pp.ends_at IS NULL
			WHERE p.id=$1 AND p.store_id=$2 AND p.active=true AND p.deleted_at IS NULL FOR UPDATE OF p`, productID, storeID)
		if errors.Is(err, sql.ErrNoRows) {
			return render.Failure(c, 404, "product_not_found", "Product was not found.")
		}
		if err == nil {
			_, err = tx.Exec(`UPDATE products SET sku=$1,barcode=NULLIF($2,''),name=$3,updated_at=now() WHERE id=$4`, input.SKU, input.Barcode, input.Name, productID)
		}
		if err == nil && oldPrice != input.Price {
			_, err = tx.Exec(`UPDATE product_prices SET ends_at=now() WHERE product_id=$1 AND ends_at IS NULL`, productID)
			if err == nil {
				_, err = tx.Exec(`INSERT INTO product_prices (product_id,amount) VALUES ($1,$2)`, productID, input.Price)
			}
		}
		if err == nil {
			_, err = tx.Exec(`UPDATE addon_options SET active=false,updated_at=now() WHERE group_id IN (SELECT id FROM addon_groups WHERE product_id=$1 AND active=true)`, productID)
		}
		if err == nil {
			_, err = tx.Exec(`UPDATE addon_groups SET active=false,updated_at=now() WHERE product_id=$1 AND active=true`, productID)
		}
	}
	if err != nil {
		return render.Failure(c, 409, "product_conflict", "Check the SKU, barcode, and add-on names.")
	}
	if _, err = tx.Exec(`UPDATE products SET cost_breakdown=$1,cost_configured=true,image_urls=$2 WHERE id=$3`, string(costs), string(images), productID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save product costs.")
	}
	if err = saveGroups(tx, storeID, productID, input.Groups); err != nil {
		return render.Failure(c, 409, "product_conflict", "Check the add-on names.")
	}
	var sequence int64
	if err = tx.Get(&sequence, `UPDATE stores SET sync_version=sync_version+1 WHERE id=$1 RETURNING sync_version`, storeID); err == nil {
		_, err = tx.Exec(`INSERT INTO sync_changes (store_id,sequence,entity_type,entity_id,operation,payload)
			VALUES ($1,$2,'product',$3::uuid,'updated',jsonb_build_object('id',$3::uuid::text))`, storeID, sequence, productID)
	}
	if err != nil {
		log.Printf("save product sync change: %v", err)
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	if err = tx.Commit(); err != nil {
		log.Printf("commit product: %v", err)
		return render.Failure(c, 500, "database_error", "Could not save product.")
	}
	return render.Response(c, 200, fiber.Map{"id": productID})
}

func Delete(c fiber.Ctx) error  { return changeDeleted(c, true) }
func Restore(c fiber.Ctx) error { return changeDeleted(c, false) }

func changeDeleted(c fiber.Ctx, deleted bool) error {
	storeID, productID := c.Params("store_id"), c.Params("product_id")
	role := auth_handler.StoreRole(c, storeID)
	if role == "" || (!deleted && !auth_handler.IsSuperadmin(c)) || (deleted && role != "owner" && role != "admin" && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "store_access_denied", "You cannot change products.")
	}
	if _, err := uuid.Parse(productID); err != nil {
		return render.Failure(c, 400, "invalid_product", "Product ID is invalid.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change product.")
	}
	defer tx.Rollback()
	var result sql.Result
	if deleted {
		result, err = tx.Exec(`UPDATE products SET active=false,deleted_at=now(),updated_at=now() WHERE id=$1 AND store_id=$2 AND deleted_at IS NULL`, productID, storeID)
	} else {
		result, err = tx.Exec(`UPDATE products SET active=true,deleted_at=NULL,updated_at=now() WHERE id=$1 AND store_id=$2 AND deleted_at IS NOT NULL`, productID, storeID)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change product.")
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return render.Failure(c, 404, "product_not_found", "Product was not found.")
	}
	var sequence int64
	if err = tx.Get(&sequence, `UPDATE stores SET sync_version=sync_version+1 WHERE id=$1 RETURNING sync_version`, storeID); err == nil {
		_, err = tx.Exec(`INSERT INTO sync_changes(store_id,sequence,entity_type,entity_id,operation,payload) VALUES($1,$2,'product',$3,$4,'{}')`, storeID, sequence, productID, map[bool]string{true: "deleted", false: "restored"}[deleted])
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change product.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not change product.")
	}
	return render.Response(c, 200, fiber.Map{"deleted": deleted})
}

func saveGroups(tx *sqlx.Tx, storeID, productID string, groups []groupInput) error {
	for i, group := range groups {
		groupID := uuid.NewString()
		_, err := tx.Exec(`INSERT INTO addon_groups (id,store_id,product_id,name,selection_mode,required,sort_order)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, groupID, storeID, productID, group.Name, group.SelectionMode, group.Required, i)
		if err != nil {
			return err
		}
		for j, option := range group.Options {
			_, err = tx.Exec(`INSERT INTO addon_options (group_id,name,price_delta,cost_delta,sort_order) VALUES ($1,$2,$3,$4,$5)`, groupID, option.Name, option.PriceDelta, option.CostDelta, j)
			if err != nil {
				return err
			}
		}
	}
	return nil
}
