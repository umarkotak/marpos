package image_handler

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

const maxImageBytes = 8 << 20

func Upload(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if _, err := uuid.Parse(storeID); err != nil || !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot upload images for this store.")
	}
	file, err := c.FormFile("image")
	if err != nil || file.Size == 0 || file.Size > maxImageBytes {
		return render.Failure(c, 400, "invalid_image", "Choose an image smaller than 8 MB.")
	}
	reader, err := file.Open()
	if err != nil {
		return render.Failure(c, 400, "invalid_image", "Could not read the image.")
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, maxImageBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxImageBytes {
		return render.Failure(c, 400, "invalid_image", "Choose an image smaller than 8 MB.")
	}
	mime := http.DetectContentType(data)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/gif" && mime != "image/webp" && !(len(data) > 12 && string(data[4:12]) == "ftypavif") {
		return render.Failure(c, 400, "invalid_image", "Use a JPEG, PNG, GIF, WebP, or AVIF image.")
	}
	dir := filepath.Join(config.Get().StorageDir, storeID)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return render.Failure(c, 500, "storage_error", "Could not save the image.")
	}
	name := uuid.NewString() + ".avif"
	path := filepath.Join(dir, name)
	defer func() {
		if err != nil {
			_ = os.Remove(path)
		}
	}()
	ctx, cancel := context.WithTimeout(c.Context(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", "pipe:0", "-frames:v", "1", "-c:v", "libsvtav1", "-pix_fmt", "yuv420p", "-f", "avif", "-y", path)
	cmd.Stdin = bytes.NewReader(data)
	if err = cmd.Run(); err != nil {
		return render.Failure(c, 400, "invalid_image", "Could not convert this image to AVIF. Check the image and FFmpeg installation.")
	}
	info, err := os.Stat(path)
	if err != nil || info.Size() == 0 {
		_ = os.Remove(path)
		return render.Failure(c, 500, "storage_error", "Could not save the image.")
	}
	return render.Response(c, 200, fiber.Map{"url": "/backend/images/" + storeID + "/" + name})
}

func Get(c fiber.Ctx) error {
	storeID, name := c.Params("store_id"), c.Params("name")
	if _, err := uuid.Parse(storeID); err != nil {
		return c.SendStatus(404)
	}
	if !strings.HasSuffix(name, ".avif") {
		return c.SendStatus(404)
	}
	if _, err := uuid.Parse(strings.TrimSuffix(name, ".avif")); err != nil {
		return c.SendStatus(404)
	}
	path := filepath.Join(config.Get().StorageDir, storeID, name)
	if _, err := os.Stat(path); err != nil {
		return c.SendStatus(404)
	}
	c.Set("Content-Type", "image/avif")
	c.Set("Cache-Control", fmt.Sprintf("public, max-age=%s", strconv.Itoa(config.Get().ImageCacheDays*86400)))
	return c.SendFile(path)
}
