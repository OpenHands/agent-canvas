import { redirect } from "react-router";

export const clientLoader = () => redirect("/settings/git");

export default function GitSettingsRedirect() {
  return null;
}
