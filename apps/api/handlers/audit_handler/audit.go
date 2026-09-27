package audit_handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/audit"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
	"strconv"
	"time"
)

func List(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot view this store's audit log.")
	}
	offset, err := strconv.Atoi(c.Query("offset", "0"))
	if err != nil || offset < 0 || offset > 100000 {
		return render.Failure(c, 400, "invalid_offset", "Check the log page.")
	}
	action := c.Query("action")
	if action != "" && action != "sale.created" && action != "sale.corrected" && action != "sale.deleted" && action != "sale.restored" {
		return render.Failure(c, 400, "invalid_action", "Choose a valid action.")
	}
	entityID := c.Query("entity_id")
	if entityID != "" {
		if _, err = uuid.Parse(entityID); err != nil {
			return render.Failure(c, 400, "invalid_order", "Order ID is invalid.")
		}
	}
	from, to := c.Query("from"), c.Query("to")
	zone := time.FixedZone("WIB", 7*60*60)
	var start, end time.Time
	if from != "" {
		start, err = time.ParseInLocation("2006-01-02", from, zone)
		if err != nil {
			return render.Failure(c, 400, "invalid_date", "Use a valid start date.")
		}
	}
	if to != "" {
		end, err = time.ParseInLocation("2006-01-02", to, zone)
		if err != nil || (!start.IsZero() && end.Before(start)) {
			return render.Failure(c, 400, "invalid_date", "Use a valid end date.")
		}
		end = end.AddDate(0, 0, 1)
	}
	rows := []audit.Entry{}
	// Summaries omit old buyer and item snapshots. Full history is in authorized order details.
	err = datastore.Get().Db.Select(&rows, audit.Select+`jsonb_build_object('reason',a.metadata->'reason','cash_delta',a.metadata->'cash_delta','revision',a.metadata->'revision','completed_at',a.metadata->'completed_at') AS metadata`+audit.From+`WHERE a.store_id=$1 AND ($2='' OR a.action=$2) AND ($3='' OR a.entity_id::text=$3) AND ($4='' OR a.created_at >= $5) AND ($6='' OR a.created_at < $7) ORDER BY a.created_at DESC,a.id DESC LIMIT 50 OFFSET $8`, storeID, action, entityID, from, start, to, end, offset)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not load the audit log.")
	}
	return render.Response(c, 200, rows)
}
