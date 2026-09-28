package config

import (
	"os"
	"strconv"

	"github.com/subosito/gotenv"
)

var config Config

func Initialize() {
	_ = gotenv.Load()
	config = Config{
		AppEnv:           getEnvStringWithDefault("APP_ENV", "development"),
		AppPort:          getEnvStringWithDefault("APP_PORT", "6010"),
		AppHost:          getEnvStringWithDefault("APP_HOST", "http://localhost:6010"),
		DbURL:            os.Getenv("DB_URL"),
		DbTimezone:       getEnvStringWithDefault("DB_TIMEZONE", "Asia/Jakarta"),
		SuperadminEmails: getEnvStringWithDefault("SUPERADMIN_EMAILS", "umarkotak@gmail.com"),
		GoogleClientID:   os.Getenv("GOOGLE_CLIENT_ID"),
		StorageDir:       getEnvStringWithDefault("STORAGE_DIR", "storage"),
		ImageCacheDays:   imageCacheDays(),
	}
}

func imageCacheDays() int {
	days, err := strconv.Atoi(os.Getenv("IMAGE_CACHE_DAYS"))
	if err != nil || days < 0 || days > 365 {
		return 7
	}
	return days
}

func Get() Config { return config }

func getEnvStringWithDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
