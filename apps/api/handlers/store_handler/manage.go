package store_handler

import (
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

type Store struct {
	ID            string  `db:"id" json:"id"`
	Name          string  `db:"name" json:"name"`
	RegisterID    string  `db:"register_id" json:"register_id"`
	TaxPercentage float64 `db:"tax_percentage" json:"tax_percentage"`
	Role          string  `db:"role" json:"role"`
}

func List(c fiber.Ctx) error {
	stores := []Store{}
	err := datastore.Get().Db.Select(&stores, `SELECT s.id,s.name,r.id AS register_id,s.tax_percentage,usr.role
        FROM user_store_roles usr JOIN stores s ON s.id=usr.store_id JOIN registers r ON r.store_id=s.id
        WHERE usr.user_id=$1 ORDER BY s.created_at`, c.Locals("user_id"))
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load stores.")
	}
	return render.Response(c, 200, stores)
}

func Create(c fiber.Ctx) error {
	var input struct {
		Name string `json:"name"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_store", "Enter a store name.")
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 100 {
		return render.Failure(c, 400, "invalid_store", "Enter a store name up to 100 characters.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	defer tx.Rollback()
	var orgID string
	if err = tx.Get(&orgID, `INSERT INTO organizations(name) VALUES($1) RETURNING id`, input.Name); err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	var store Store
	if err = tx.Get(&store.ID, `INSERT INTO stores(organization_id,name) VALUES($1,$2) RETURNING id`, orgID, input.Name); err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	if err = tx.Get(&store.RegisterID, `INSERT INTO registers(store_id,name) VALUES($1,'Register 1') RETURNING id`, store.ID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	if _, err = tx.Exec(`INSERT INTO user_store_roles(user_id,store_id,role) VALUES($1,$2,'owner')`, c.Locals("user_id"), store.ID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not create store.")
	}
	store.Name, store.Role = input.Name, "owner"
	return render.Response(c, 201, store)
}

func RegisterDevice(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if auth_handler.StoreRole(c, storeID) == "" {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	var input struct {
		DeviceID string `json:"device_id"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_device", "Check the device ID.")
	}
	if _, err := uuid.Parse(input.DeviceID); err != nil {
		return render.Failure(c, 400, "invalid_device", "Check the device ID.")
	}
	var registerID string
	if err := datastore.Get().Db.Get(&registerID, `SELECT id FROM registers WHERE store_id=$1 AND active=true`, storeID); err != nil {
		return render.Failure(c, 404, "register_not_found", "Register was not found.")
	}
	now := time.Now().UTC()
	expires := c.Locals("session_expires_at").(time.Time)
	_, err := datastore.Get().Db.Exec(`INSERT INTO sync_devices(id,store_id,register_id,user_id,last_online_login_at,offline_expires_at)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET
        store_id=EXCLUDED.store_id,register_id=EXCLUDED.register_id,user_id=EXCLUDED.user_id,
        last_online_login_at=EXCLUDED.last_online_login_at,offline_expires_at=EXCLUDED.offline_expires_at,revoked_at=NULL`, input.DeviceID, storeID, registerID, c.Locals("user_id"), now, expires)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not register device.")
	}
	return render.Response(c, 200, fiber.Map{"offline_expires_at": expires})
}

type Invitation struct {
	ID        string `db:"id" json:"id"`
	StoreID   string `db:"store_id" json:"store_id"`
	StoreName string `db:"store_name" json:"store_name"`
	Email     string `db:"email" json:"email"`
	Role      string `db:"role" json:"role"`
}

func Invitations(c fiber.Ctx) error {
	items := []Invitation{}
	err := datastore.Get().Db.Select(&items, `SELECT i.id,i.store_id,s.name AS store_name,i.email,i.role
        FROM store_invitations i JOIN stores s ON s.id=i.store_id JOIN users u ON lower(u.email)=lower(i.email)
        WHERE u.id=$1 AND i.status='pending' ORDER BY i.created_at DESC`, c.Locals("user_id"))
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load invitations.")
	}
	return render.Response(c, 200, items)
}

func Invite(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	callerRole := auth_handler.StoreRole(c, storeID)
	if callerRole != "owner" && callerRole != "admin" {
		return render.Failure(c, 403, "store_access_denied", "You cannot invite users.")
	}
	var input struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_invitation", "Check the invitation.")
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if address, err := mail.ParseAddress(input.Email); err != nil || address.Address != input.Email || len(input.Email) > 320 {
		return render.Failure(c, 400, "invalid_email", "Enter a valid email address.")
	}
	if input.Role != "cashier" && input.Role != "manager" && !(input.Role == "admin" && callerRole == "owner") {
		return render.Failure(c, 403, "invalid_role", "You cannot assign that role.")
	}
	var already bool
	err := datastore.Get().Db.Get(&already, `SELECT EXISTS(SELECT 1 FROM user_store_roles usr JOIN users u ON u.id=usr.user_id WHERE usr.store_id=$1 AND lower(u.email)=$2)`, storeID, input.Email)
	if err != nil || already {
		return render.Failure(c, 409, "already_member", "This user already belongs to the store.")
	}
	var recipientExists bool
	if err = datastore.Get().Db.Get(&recipientExists, `SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=$1 AND active=true)`, input.Email); err != nil {
		return render.Failure(c, 500, "database_error", "Could not check user.")
	}
	if !recipientExists {
		return render.Failure(c, 404, "user_not_found", "This user must sign in before you can invite them.")
	}
	var id string
	err = datastore.Get().Db.Get(&id, `INSERT INTO store_invitations(store_id,email,role,created_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(store_id,lower(email)) DO UPDATE SET
        role=EXCLUDED.role,created_by=EXCLUDED.created_by,created_at=now(),status='pending',decided_at=NULL
        WHERE store_invitations.status!='accepted' RETURNING id`, storeID, input.Email, input.Role, c.Locals("user_id"))
	if errors.Is(err, sql.ErrNoRows) {
		return render.Failure(c, 409, "already_accepted", "This user already accepted an invitation to this store.")
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not create invitation.")
	}
	return render.Response(c, 201, fiber.Map{"id": id})
}

func DecideInvitation(c fiber.Ctx) error {
	id := c.Params("invitation_id")
	if _, err := uuid.Parse(id); err != nil {
		return render.Failure(c, 400, "invalid_invitation", "Invitation was not found.")
	}
	var input struct {
		Accept bool `json:"accept"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_invitation", "Check your choice.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not update invitation.")
	}
	defer tx.Rollback()
	var invitation Invitation
	err = tx.Get(&invitation, `SELECT i.id,i.store_id,i.email,i.role FROM store_invitations i
        JOIN users u ON lower(u.email)=lower(i.email) WHERE i.id=$1 AND u.id=$2 AND i.status='pending' FOR UPDATE OF i`, id, c.Locals("user_id"))
	if err != nil {
		return render.Failure(c, 404, "invitation_not_found", "Invitation was not found.")
	}
	status := "rejected"
	if input.Accept {
		status = "accepted"
		if _, err = tx.Exec(`INSERT INTO user_store_roles(user_id,store_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, c.Locals("user_id"), invitation.StoreID, invitation.Role); err != nil {
			return render.Failure(c, 500, "database_error", "Could not join store.")
		}
	}
	if _, err = tx.Exec(`UPDATE store_invitations SET status=$1,decided_at=now() WHERE id=$2`, status, id); err != nil {
		return render.Failure(c, 500, "database_error", "Could not update invitation.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not update invitation.")
	}
	return render.Response(c, 200, fiber.Map{"status": status})
}

type Member struct {
	UserID string `db:"user_id" json:"user_id"`
	Email  string `db:"email" json:"email"`
	Name   string `db:"name" json:"name"`
	Role   string `db:"role" json:"role"`
}

func Members(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if auth_handler.StoreRole(c, storeID) == "" {
		return render.Failure(c, 403, "store_access_denied", "You cannot access this store.")
	}
	members := []Member{}
	if err := datastore.Get().Db.Select(&members, `SELECT u.id AS user_id,u.email,u.name,usr.role FROM user_store_roles usr JOIN users u ON u.id=usr.user_id WHERE usr.store_id=$1 ORDER BY u.name`, storeID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not load team.")
	}
	return render.Response(c, 200, members)
}

func SetMemberRole(c fiber.Ctx) error {
	storeID, userID := c.Params("store_id"), c.Params("user_id")
	callerRole := auth_handler.StoreRole(c, storeID)
	if callerRole != "owner" && callerRole != "admin" {
		return render.Failure(c, 403, "store_access_denied", "You cannot manage roles.")
	}
	if _, err := uuid.Parse(userID); err != nil {
		return render.Failure(c, 400, "invalid_user", "User was not found.")
	}
	var input struct {
		Role string `json:"role"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_role", "Choose a role.")
	}
	if input.Role != "cashier" && input.Role != "manager" && !(input.Role == "admin" && callerRole == "owner") {
		return render.Failure(c, 403, "invalid_role", "You cannot assign that role.")
	}
	result, err := datastore.Get().Db.Exec(`UPDATE user_store_roles SET role=$1 WHERE store_id=$2 AND user_id=$3 AND role!='owner' AND ($4='owner' OR role!='admin')`, input.Role, storeID, userID, callerRole)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not change role.")
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return render.Failure(c, 404, "member_not_found", "Member was not found or cannot be changed.")
	}
	return render.Response(c, 200, fiber.Map{"role": input.Role})
}

func RemoveMember(c fiber.Ctx) error {
	storeID, userID := c.Params("store_id"), c.Params("user_id")
	callerRole := auth_handler.StoreRole(c, storeID)
	if callerRole != "owner" && callerRole != "admin" {
		return render.Failure(c, 403, "store_access_denied", "You cannot remove users.")
	}
	if _, err := uuid.Parse(userID); err != nil {
		return render.Failure(c, 400, "invalid_user", "User was not found.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not remove user.")
	}
	defer tx.Rollback()
	result, err := tx.Exec(`DELETE FROM user_store_roles WHERE store_id=$1 AND user_id=$2 AND role!='owner' AND ($3='owner' OR role!='admin')`, storeID, userID, callerRole)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not remove user.")
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return render.Failure(c, 404, "member_not_found", "Member was not found or cannot be removed.")
	}
	if _, err = tx.Exec(`UPDATE sync_devices SET revoked_at=now() WHERE store_id=$1 AND user_id=$2`, storeID, userID); err != nil {
		return render.Failure(c, 500, "database_error", "Could not revoke device.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not remove user.")
	}
	return render.Response(c, 200, fiber.Map{"removed": true})
}
