package main

import (
	"log"
	"os"

	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/umarkotak/marpos/apps/api/bootstrap"
	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/audit_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/finance_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/image_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/ping_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/product_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/sale_handler"
	"github.com/umarkotak/marpos/apps/api/handlers/store_handler"
)

func main() {
	if err := bootstrap.InitializeApp(); err != nil {
		log.Fatal(err)
	}
	defer datastore.Close()

	if len(os.Args) == 3 && os.Args[1] == "migrate" && os.Args[2] == "up" {
		if err := datastore.MigrateUp(); err != nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) != 1 {
		log.Fatal("usage: go run . [migrate up]")
	}

	if err := newApp().Listen(":" + config.Get().AppPort); err != nil {
		log.Fatal(err)
	}
}

func newApp() *fiber.App {
	app := fiber.New(fiber.Config{
		JSONEncoder: sonic.Marshal,
		JSONDecoder: sonic.Unmarshal,
		BodyLimit:   9 << 20,
	})
	app.Use(requestid.New(), recover.New())
	api := app.Group("/marpos/api")
	api.Get("/ping", ping_handler.Ping)
	api.Get("/auth/config", auth_handler.Config)
	api.Get("/images/:store_id/:name", image_handler.Get)
	api.Post("/auth/google", auth_handler.Google)
	private := api.Group("", auth_handler.Require)
	private.Get("/auth/me", auth_handler.Me)
	private.Post("/auth/logout", auth_handler.Logout)
	private.Get("/stores", store_handler.List)
	private.Post("/stores", store_handler.Create)
	private.Get("/invitations", store_handler.Invitations)
	private.Post("/invitations/:invitation_id/decision", store_handler.DecideInvitation)
	private.Post("/stores/:store_id/device", store_handler.RegisterDevice)
	private.Get("/stores/:store_id/members", store_handler.Members)
	private.Post("/stores/:store_id/invitations", store_handler.Invite)
	private.Put("/stores/:store_id/members/:user_id", store_handler.SetMemberRole)
	private.Delete("/stores/:store_id/members/:user_id", store_handler.RemoveMember)
	private.Get("/stores/:store_id/products", product_handler.List)
	private.Get("/stores/:store_id/products/categories", product_handler.Categories)
	private.Post("/stores/:store_id/images", image_handler.Upload)
	private.Post("/stores/:store_id/products", product_handler.Save)
	private.Delete("/stores/:store_id/products", store_handler.ClearProducts)
	private.Put("/stores/:store_id/products/:product_id", product_handler.Save)
	private.Delete("/stores/:store_id/products/:product_id", product_handler.Delete)
	private.Post("/stores/:store_id/products/:product_id/restore", product_handler.Restore)
	private.Post("/stores/:store_id/sales", sale_handler.Sync)
	private.Get("/stores/:store_id/audit-logs", audit_handler.List)
	private.Get("/stores/:store_id/sales", sale_handler.History)
	private.Delete("/stores/:store_id/sales", store_handler.ClearOrders)
	private.Get("/stores/:store_id/sales/:sale_id", sale_handler.Detail)
	private.Put("/stores/:store_id/sales/:sale_id", sale_handler.Correct)
	private.Delete("/stores/:store_id/sales/:sale_id", sale_handler.Delete)
	private.Post("/stores/:store_id/sales/:sale_id/restore", sale_handler.Restore)
	private.Get("/stores/:store_id/finance", finance_handler.List)
	private.Post("/stores/:store_id/finance", finance_handler.Save)
	private.Delete("/stores/:store_id/finance/:entry_id", finance_handler.Delete)
	private.Post("/stores/:store_id/finance/:entry_id/restore", finance_handler.Restore)
	private.Get("/stores/:store_id/reports", finance_handler.Report)
	private.Put("/stores/:store_id/settings", store_handler.SaveSettings)
	return app
}
