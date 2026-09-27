export const blankBuyer=()=>({buyer_name:"",buyer_phone:"",buyer_email:""});
export function buyerError(buyer){
  const name=buyer.buyer_name.trim(),phone=buyer.buyer_phone.trim(),email=buyer.buyer_email.trim();
  if(!name&&!phone&&!email)return "Enter a buyer name, phone, or email.";
  if(name.length>200||phone.length>50||email.length>254||[name,phone,email].some((value)=>/[\x00-\x1f\x7f]/.test(value)))return "Check the buyer details.";
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return "Enter a valid buyer email.";
  if(phone&&(!/^[0-9+(). -]+$/.test(phone)||(phone.match(/[0-9]/g)||[]).length<3))return "Enter a valid buyer phone.";
  return "";
}
export function BuyerFields({buyer,onChange,disabled=false}){
 return <fieldset className="buyer-fields" disabled={disabled}><legend>Buyer details</legend><p>Enter at least one field before checkout.</p>{[["buyer_name","Buyer name","text",200],["buyer_phone","Buyer phone","tel",50],["buyer_email","Buyer email","email",254]].map(([key,label,type,maxLength])=><label key={key}>{label}<input type={type} maxLength={maxLength} value={buyer[key]||""} onChange={(event)=>onChange({...buyer,[key]:event.target.value})}/></label>)}</fieldset>;
}
