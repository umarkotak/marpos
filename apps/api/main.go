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
	"github.com/umarkotak/marpos/apps/api/handlers/ping_handler"
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
	})
	app.Use(requestid.New(), recover.New())
	app.Group("/marpos/api").Get("/ping", ping_handler.Ping)
	return app
}
