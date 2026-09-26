package bootstrap

import (
	"fmt"

	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/datastore"
)

func InitializeApp() error {
	config.Initialize()
	if config.Get().DbURL == "" {
		return fmt.Errorf("DB_URL is required")
	}
	return datastore.Initialize()
}
