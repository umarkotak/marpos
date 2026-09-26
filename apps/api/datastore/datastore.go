package datastore

import (
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/umarkotak/marpos/apps/api/config"
)

type DataStore struct {
	Db *sqlx.DB
}

var dataStore DataStore

func Initialize() error {
	db, err := sqlx.Connect("postgres", config.Get().DbURL)
	if err != nil {
		return err
	}
	dataStore = DataStore{Db: db}
	return nil
}

func Get() DataStore { return dataStore }

func Close() error {
	if dataStore.Db != nil {
		return dataStore.Db.Close()
	}
	return nil
}
