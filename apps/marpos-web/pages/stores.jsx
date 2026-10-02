import { StoreManagement } from "@/components/stores/store-management";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const {
    stores,
    invitations,
    createStore,
    selectStore,
    decideInvitation,
    notice,
  } = useRegister();
  return (
    <StoreManagement
      stores={stores}
      invitations={invitations}
      onCreate={createStore}
      onSelect={selectStore}
      onDecide={decideInvitation}
      notice={notice}
    />
  );
}
