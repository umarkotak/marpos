package ping_handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

func Ping(c fiber.Ctx) error {
	return render.Response(c, fiber.StatusOK, fiber.Map{"ping": "pong"})
}
