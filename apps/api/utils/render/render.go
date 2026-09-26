package render

import "github.com/gofiber/fiber/v3"

type ResponseBody struct {
	Data    any       `json:"data"`
	Success bool      `json:"success"`
	Error   ErrorData `json:"error"`
}

type ErrorData struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

func Response(c fiber.Ctx, statusCode int, data any) error {
	if data == nil {
		data = map[string]any{}
	}
	return c.Status(statusCode).JSON(ResponseBody{Data: data, Success: true, Error: ErrorData{}})
}
