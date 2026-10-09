import { t, message, useI18n } from "@/lib/i18n";
export const blankBuyer = () => ({
  buyer_name: "",
  buyer_phone: "",
  buyer_email: "",
});
export function buyerError(buyer) {
  const name = buyer.buyer_name.trim(),
    phone = buyer.buyer_phone.trim(),
    email = buyer.buyer_email.trim();
  if (!name && !phone && !email)
    return message("enter_a_buyer_name_phone_or_email");
  if (
    name.length > 200 ||
    phone.length > 50 ||
    email.length > 254 ||
    [name, phone, email].some((value) => /[\x00-\x1f\x7f]/.test(value))
  )
    return message("check_the_buyer_details");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return message("enter_a_valid_buyer_email");
  if (
    phone &&
    (!/^[0-9+(). -]+$/.test(phone) || (phone.match(/[0-9]/g) || []).length < 3)
  )
    return message("enter_a_valid_buyer_phone");
  return "";
}
export function BuyerFields({ buyer, onChange, disabled = false }) {
  useI18n();
  return (
    <fieldset className="buyer-fields" disabled={disabled}>
      <legend>{t("buyer_details")}</legend>
      <p>{t("enter_at_least_one_field_before_checkout")}</p>
      {[
        ["buyer_name", t("buyer_name"), "text", 200],
        ["buyer_phone", t("buyer_phone"), "tel", 50],
        ["buyer_email", t("buyer_email"), "email", 254],
      ].map(([key, label, type, maxLength]) => (
        <label key={key}>
          {label}
          <input
            type={type}
            maxLength={maxLength}
            value={buyer[key] || ""}
            onChange={(event) =>
              onChange({ ...buyer, [key]: event.target.value })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
