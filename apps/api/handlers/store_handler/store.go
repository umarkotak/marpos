package store_handler

import (
	"math"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func SaveSettings(c fiber.Ctx) error {
	storeID := c.Params("store_id")
	if !auth_handler.StoreAccess(c, storeID, true) {
		return render.Failure(c, 403, "store_access_denied", "You cannot change this store.")
	}
	var input struct {
		Name          string  `json:"name"`
		Slug          string  `json:"slug"`
		Address       string  `json:"address"`
		GoogleMapsURL string  `json:"google_maps_url"`
		InstagramURL  string  `json:"instagram_url"`
		FacebookURL   string  `json:"facebook_url"`
		TikTokURL     string  `json:"tiktok_url"`
		TaxPercentage float64 `json:"tax_percentage"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_request", "Check the store settings.")
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.TrimSpace(input.Slug)
	input.Address = strings.TrimSpace(input.Address)
	input.GoogleMapsURL = strings.TrimSpace(input.GoogleMapsURL)
	input.InstagramURL = strings.TrimSpace(input.InstagramURL)
	input.FacebookURL = strings.TrimSpace(input.FacebookURL)
	input.TikTokURL = strings.TrimSpace(input.TikTokURL)
	if input.Name == "" || len(input.Name) > 100 || math.IsNaN(input.TaxPercentage) || input.TaxPercentage < 0 || input.TaxPercentage > 100 || math.Abs(math.Round(input.TaxPercentage*100)-input.TaxPercentage*100) > 0.000001 {
		return render.Failure(c, 400, "invalid_settings", "Add a store name and a tax percentage from 0 to 100.")
	}
	if len(input.Slug) > 100 || !slugPattern.MatchString(input.Slug) {
		return render.Failure(c, 400, "invalid_slug", "Use lowercase letters, numbers, and hyphens for the store slug.")
	}
	if utf8.RuneCountInString(input.Address) > 500 {
		return render.Failure(c, 400, "invalid_address", "Keep the store address under 500 characters.")
	}
	if input.GoogleMapsURL != "" {
		link, err := url.Parse(input.GoogleMapsURL)
		if err != nil || link.Scheme != "https" || link.User != nil || link.Port() != "" || !googleMapsHost(strings.ToLower(link.Hostname())) || len(input.GoogleMapsURL) > 2048 {
			return render.Failure(c, 400, "invalid_google_maps_url", "Enter a valid Google Maps link.")
		}
	}
	for _, social := range []struct{ name, value, domain string }{
		{"Instagram", input.InstagramURL, "instagram.com"},
		{"Facebook", input.FacebookURL, "facebook.com"},
		{"TikTok", input.TikTokURL, "tiktok.com"},
	} {
		if !validSocialURL(social.value, social.domain) {
			return render.Failure(c, 400, "invalid_social_url", "Enter a valid "+social.name+" link.")
		}
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	defer tx.Rollback()
	_, err = tx.Exec(`UPDATE stores SET name=$1,slug=$2,address=$3,google_maps_url=$4,instagram_url=$5,facebook_url=$6,tiktok_url=$7,tax_percentage=$8,updated_at=now() WHERE id=$9`, input.Name, input.Slug, input.Address, input.GoogleMapsURL, input.InstagramURL, input.FacebookURL, input.TikTokURL, input.TaxPercentage, storeID)
	if err != nil {
		return render.Failure(c, 409, "store_conflict", "Store name or slug is already in use.")
	}
	var sequence int64
	if err = tx.Get(&sequence, `UPDATE stores SET sync_version=sync_version+1 WHERE id=$1 RETURNING sync_version`, storeID); err == nil {
		_, err = tx.Exec(`INSERT INTO sync_changes (store_id,sequence,entity_type,entity_id,operation,payload)
			VALUES ($1,$2,'store',$1,'updated',jsonb_build_object('name',$3::text,'slug',$4::text,'address',$5::text,'google_maps_url',$6::text,'instagram_url',$7::text,'facebook_url',$8::text,'tiktok_url',$9::text,'tax_percentage',$10::numeric))`, storeID, sequence, input.Name, input.Slug, input.Address, input.GoogleMapsURL, input.InstagramURL, input.FacebookURL, input.TikTokURL, input.TaxPercentage)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not save store settings.")
	}
	return render.Response(c, 200, fiber.Map{"name": input.Name, "slug": input.Slug, "address": input.Address, "google_maps_url": input.GoogleMapsURL, "instagram_url": input.InstagramURL, "facebook_url": input.FacebookURL, "tiktok_url": input.TikTokURL, "tax_percentage": input.TaxPercentage})
}

func validSocialURL(value, domain string) bool {
	if value == "" {
		return true
	}
	link, err := url.Parse(value)
	if err != nil || len(value) > 2048 || link.Scheme != "https" || link.User != nil || link.Port() != "" {
		return false
	}
	host := strings.ToLower(link.Hostname())
	return host == domain || strings.HasSuffix(host, "."+domain)
}

func googleMapsHost(host string) bool {
	return host == "google.com" || strings.HasSuffix(host, ".google.com") || host == "maps.app.goo.gl" || host == "goo.gl" || host == "g.page"
}
