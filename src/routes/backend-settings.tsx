import { Navigate } from "react-router";

const APP_HOME_PATH = "/";

export default function BackendSettingsScreen() {
  return <Navigate to={APP_HOME_PATH} replace />;
}
