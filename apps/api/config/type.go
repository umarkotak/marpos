package config

type Config struct {
	AppEnv           string
	AppPort          string
	AppHost          string
	DbURL            string
	DbTimezone       string
	SuperadminEmails string
	GoogleClientID   string
}
