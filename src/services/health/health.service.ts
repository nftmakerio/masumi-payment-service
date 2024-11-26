import { healthRepository } from "@/repositories/health";
function getHealthConfiguration() {
    return healthRepository.getHealthConfiguration();
}
export const healthService = { getHealthConfiguration }