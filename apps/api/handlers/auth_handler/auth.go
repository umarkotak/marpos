package auth_handler

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/utils/render"
	"google.golang.org/api/idtoken"
)

const cookieName = "marpos_session"
const offlinePeriod = 30 * 24 * time.Hour

type sessionData struct {
	IsSuperadmin     bool      `json:"is_superadmin"`
	UserID           string    `db:"user_id" json:"user_id"`
	Name             string    `db:"name" json:"name"`
	Email            string    `db:"email" json:"email"`
	OfflineExpiresAt time.Time `json:"offline_expires_at"`
}

func Config(c fiber.Ctx) error {
	return render.Response(c, fiber.StatusOK, fiber.Map{"google_client_id": config.Get().GoogleClientID})
}

func Google(c fiber.Ctx) error {
	clientID := config.Get().GoogleClientID
	if clientID == "" {
		return render.Failure(c, fiber.StatusServiceUnavailable, "google_not_configured", "Set GOOGLE_CLIENT_ID in the API environment.")
	}
	var input struct {
		Credential string `json:"credential"`
		DeviceID   string `json:"device_id"`
	}
	if err := c.Bind().Body(&input); err != nil || input.Credential == "" {
		return render.Failure(c, fiber.StatusBadRequest, "invalid_request", "A Google credential is required.")
	}
	if _, err := uuid.Parse(input.DeviceID); err != nil {
		return render.Failure(c, fiber.StatusBadRequest, "invalid_device", "A valid device ID is required.")
	}
	payload, err := idtoken.Validate(c.Context(), input.Credential, clientID)
	if err != nil || payload.Subject == "" {
		return render.Failure(c, fiber.StatusUnauthorized, "invalid_google_token", "Google sign-in failed.")
	}
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	verified, _ := payload.Claims["email_verified"].(bool)
	if !verified || email == "" {
		return render.Failure(c, fiber.StatusUnauthorized, "unverified_email", "Use a verified Google account.")
	}
	if name == "" {
		name = email
	}
	if payload.Issuer != "https://accounts.google.com" && payload.Issuer != "accounts.google.com" {
		return render.Failure(c, fiber.StatusUnauthorized, "invalid_issuer", "Google sign-in failed.")
	}

	db := datastore.Get().Db
	tx, err := db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Sign-in failed.")
	}
	defer tx.Rollback()
	var userID string
	err = tx.Get(&userID, `SELECT id FROM users WHERE google_subject = $1 AND active = true`, payload.Subject)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.Get(&userID, `INSERT INTO users (google_subject, email, name) VALUES ($1, $2, $3) RETURNING id`, payload.Subject, email, name)
	} else if err == nil {
		_, err = tx.Exec(`UPDATE users SET email = $1, name = $2 WHERE id = $3`, email, name, userID)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Sign-in failed.")
	}
	var data sessionData
	data.UserID, data.Name, data.Email = userID, name, email
	data.IsSuperadmin = superadminEmail(email)
	now := time.Now().UTC()
	data.OfflineExpiresAt = now.Add(offlinePeriod)
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return render.Failure(c, 500, "session_error", "Sign-in failed.")
	}
	token := hex.EncodeToString(secret[:])
	hash := sha256.Sum256([]byte(token))
	_, err = tx.Exec(`INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, userID, hex.EncodeToString(hash[:]), data.OfflineExpiresAt)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Sign-in failed.")
	}
	if err := tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Sign-in failed.")
	}
	c.Cookie(&fiber.Cookie{Name: cookieName, Value: token, Path: "/", HTTPOnly: true, Secure: config.Get().AppEnv == "production", SameSite: "Lax", MaxAge: int(offlinePeriod.Seconds())})
	return render.Response(c, fiber.StatusOK, data)
}

func Require(c fiber.Ctx) error {
	token := c.Cookies(cookieName)
	if token == "" {
		return render.Failure(c, fiber.StatusUnauthorized, "login_required", "Sign in to continue.")
	}
	hash := sha256.Sum256([]byte(token))
	var session struct {
		Email     string    `db:"email"`
		UserID    string    `db:"user_id"`
		ExpiresAt time.Time `db:"expires_at"`
	}
	err := datastore.Get().Db.Get(&session, `SELECT a.user_id,a.expires_at,u.email FROM auth_sessions a JOIN users u ON u.id = a.user_id
		WHERE a.token_hash = $1 AND a.revoked_at IS NULL AND a.expires_at > now() AND u.active = true`, hex.EncodeToString(hash[:]))
	if err != nil {
		return render.Failure(c, fiber.StatusUnauthorized, "login_required", "Sign in to continue.")
	}
	c.Locals("is_superadmin", superadminEmail(session.Email))
	c.Locals("user_id", session.UserID)
	c.Locals("session_expires_at", session.ExpiresAt)
	return c.Next()
}

func StoreAccess(c fiber.Ctx, storeID string, edit bool) bool {
	role := StoreRole(c, storeID)
	return role != "" && (!edit || role == "owner" || role == "admin" || role == "manager" || IsSuperadmin(c))
}

func StoreRole(c fiber.Ctx, storeID string) string {
	if _, err := uuid.Parse(storeID); err != nil {
		return ""
	}
	var role string
	err := datastore.Get().Db.Get(&role, `SELECT role FROM user_store_roles WHERE user_id = $1 AND store_id = $2`, c.Locals("user_id"), storeID)
	if err != nil {
		return ""
	}
	return role
}

func Me(c fiber.Ctx) error {
	var data sessionData
	err := datastore.Get().Db.Get(&data, `SELECT id AS user_id, name, email FROM users WHERE id = $1`, c.Locals("user_id"))
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load your store.")
	}
	data.IsSuperadmin = IsSuperadmin(c)
	data.OfflineExpiresAt = c.Locals("session_expires_at").(time.Time)
	return render.Response(c, fiber.StatusOK, data)
}

func Logout(c fiber.Ctx) error {
	hash := sha256.Sum256([]byte(c.Cookies(cookieName)))
	_, _ = datastore.Get().Db.Exec(`UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1`, hex.EncodeToString(hash[:]))
	c.Cookie(&fiber.Cookie{Name: cookieName, Value: "", Path: "/", HTTPOnly: true, MaxAge: -1})
	return render.Response(c, fiber.StatusOK, nil)
}

func superadminEmail(email string) bool {
	for _, allowed := range strings.Split(config.Get().SuperadminEmails, ",") {
		if strings.EqualFold(strings.TrimSpace(allowed), email) && email != "" {
			return true
		}
	}
	return false
}
func IsSuperadmin(c fiber.Ctx) bool { return c.Locals("is_superadmin") == true }
