import { createSecurityClient } from "./typescript-client";

class InvariantService {
  static async getPolicy() {
    return createSecurityClient().getPolicy();
  }

  static async getRiskSeverity() {
    return createSecurityClient().getRiskSeverity();
  }

  static async getTraces() {
    return createSecurityClient().exportTrace();
  }

  static async updatePolicy(policy: string) {
    await createSecurityClient().updatePolicy(policy);
  }

  static async updateRiskSeverity(riskSeverity: number) {
    await createSecurityClient().updateRiskSeverity(riskSeverity);
  }
}

export default InvariantService;
