package config

import (
	"os"

	"github.com/subosito/gotenv"
)

var config Config

func Initialize() {
	_ = gotenv.Load()
	config = Config{
		AppEnv:     getEnvStringWithDefault("APP_ENV", "development"),
		AppPort:    getEnvStringWithDefault("APP_PORT", "33000"),
		AppHost:    getEnvStringWithDefault("APP_HOST", "http://localhost:33000"),
		DbURL:      os.Getenv("DB_URL"),
		DbTimezone: getEnvStringWithDefault("DB_TIMEZONE", "Asia/Jakarta"),
	}
}

func Get() Config { return config }

func getEnvStringWithDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
