import { TeamPage } from "@/components/team/team-page";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const { auth, setNotice } = useRegister();
  return <TeamPage auth={auth} onNotice={setNotice} />;
}
