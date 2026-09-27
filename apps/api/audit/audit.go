package audit

import (
	"encoding/json"
	"fmt"
	"github.com/jmoiron/sqlx"
	"github.com/jmoiron/sqlx/types"
	"time"
)

// Write is part of the same transaction as the action it records.
func Write(tx *sqlx.Tx, storeID, userID, action, entityType, entityID string, metadata interface{}) error {
	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	result, err := tx.Exec(`INSERT INTO audit_logs(store_id,user_id,action,entity_type,entity_id,metadata)
 SELECT $1,$2,$3,$4,$5,$6::jsonb||jsonb_build_object('actor_name',u.name,'actor_email',u.email) FROM users u WHERE u.id=$2`, storeID, userID, action, entityType, entityID, string(data))
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("audit actor was not found")
	}
	return nil
}

type Entry struct {
	EntityDeleted bool           `db:"entity_deleted" json:"entity_deleted"`
	ID            string         `db:"id" json:"id"`
	UserID        string         `db:"user_id" json:"user_id"`
	ActorName     string         `db:"actor_name" json:"actor_name"`
	ActorEmail    string         `db:"actor_email" json:"actor_email"`
	Action        string         `db:"action" json:"action"`
	EntityType    string         `db:"entity_type" json:"entity_type"`
	EntityID      string         `db:"entity_id" json:"entity_id"`
	Reference     string         `db:"reference" json:"reference"`
	CreatedAt     time.Time      `db:"created_at" json:"created_at"`
	Metadata      types.JSONText `db:"metadata" json:"metadata"`
}

const Select = `SELECT a.id,COALESCE(a.user_id::text,'') AS user_id,COALESCE(a.metadata->>'actor_name',u.name,'Unknown user') AS actor_name,COALESCE(a.metadata->>'actor_email',u.email,'') AS actor_email,a.action,a.entity_type,a.entity_id,COALESCE(s.reference,a.entity_id::text) AS reference,a.created_at,(s.deleted_at IS NOT NULL) AS entity_deleted,`
const From = ` FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN sales s ON a.entity_type='sale' AND s.id=a.entity_id AND s.store_id=a.store_id `

func History(db *sqlx.DB, storeID, entityType, entityID string) ([]Entry, error) {
	rows := []Entry{}
	err := db.Select(&rows, Select+`a.metadata`+From+`WHERE a.store_id=$1 AND a.entity_type=$2 AND a.entity_id=$3 ORDER BY a.created_at DESC,a.id DESC`, storeID, entityType, entityID)
	return rows, err
}
