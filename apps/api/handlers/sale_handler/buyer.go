package sale_handler

import (
	"errors"
	"net/mail"
	"strings"
	"unicode"
)

type buyerInput struct {
	BuyerName  string `db:"buyer_name" json:"buyer_name"`
	BuyerPhone string `db:"buyer_phone" json:"buyer_phone"`
	BuyerEmail string `db:"buyer_email" json:"buyer_email"`
}

func (buyer *buyerInput) validate() error {
	buyer.BuyerName = strings.TrimSpace(buyer.BuyerName)
	buyer.BuyerPhone = strings.TrimSpace(buyer.BuyerPhone)
	buyer.BuyerEmail = strings.TrimSpace(buyer.BuyerEmail)
	if buyer.BuyerName == "" && buyer.BuyerPhone == "" && buyer.BuyerEmail == "" {
		return errors.New("Enter a buyer name, phone, or email.")
	}
	if len(buyer.BuyerName) > 200 || len(buyer.BuyerPhone) > 50 || len(buyer.BuyerEmail) > 254 {
		return errors.New("Buyer details are too long.")
	}
	for _, value := range []string{buyer.BuyerName, buyer.BuyerPhone, buyer.BuyerEmail} {
		for _, character := range value {
			if unicode.IsControl(character) {
				return errors.New("Check the buyer details.")
			}
		}
	}
	if buyer.BuyerEmail != "" {
		address, err := mail.ParseAddress(buyer.BuyerEmail)
		if err != nil || address.Address != buyer.BuyerEmail {
			return errors.New("Enter a valid buyer email.")
		}
	}
	if buyer.BuyerPhone != "" {
		digits := 0
		for _, character := range buyer.BuyerPhone {
			if character >= '0' && character <= '9' {
				digits++
			} else if !strings.ContainsRune("+(). -", character) {
				return errors.New("Enter a valid buyer phone.")
			}
		}
		if digits < 3 {
			return errors.New("Enter a valid buyer phone.")
		}
	}
	return nil
}
