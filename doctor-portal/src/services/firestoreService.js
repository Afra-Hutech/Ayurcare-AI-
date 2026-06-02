import { doctorService } from './api';

/**
 * Check if a doctor document exists for the given UID.
 */
export const getDoctorData = async (uid) => {
  try {
    const data = await doctorService.getProfile();
    return data;
  } catch (err) {
    return null;
  }
};

/**
 * Save doctor onboarding details to MongoDB.
 */
export const saveDoctorOnboarding = async (uid, data) => {
  try {
    const result = await doctorService.onboard(data);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
};
