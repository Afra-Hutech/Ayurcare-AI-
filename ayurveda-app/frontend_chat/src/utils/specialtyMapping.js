/**
 * Mapping of body systems and symptoms to medical specialties.
 * Used to enhance doctor recommendations when a specific treatment match isn't found.
 */
export const SPECIALTY_MAP = {
  // Respiratory System
  'Respiratory': ['Pulmonology (Lungs)', 'General Consultation'],
  'Breathing Issue': ['Pulmonology (Lungs)', 'General Consultation'],
  'Cough': ['Pulmonology (Lungs)', 'General Consultation'],
  'Asthma': ['Pulmonology (Lungs)', 'General Consultation'],
  'Kasa': ['Pulmonology (Lungs)', 'General Consultation'],
  'Shvasa': ['Pulmonology (Lungs)', 'General Consultation'],

  // Digestive System
  'Digestive': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Stomach': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Indigestion': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Ajirna': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Acidity': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Constipation': ['Gastroenterology (Stomach)', 'General Consultation'],
  'Agnimandya': ['Gastroenterology (Stomach)', 'General Consultation'],

  // Cardiovascular System
  'Heart': ['Cardiology (Heart)', 'General Consultation'],
  'Cardiovascular': ['Cardiology (Heart)', 'General Consultation'],
  'Blood Pressure': ['Cardiology (Heart)', 'General Consultation'],
  'Hridroga': ['Cardiology (Heart)', 'General Consultation'],

  // Dermatology
  'Skin': ['Dermatology (Skin)', 'General Consultation'],
  'Itching': ['Dermatology (Skin)', 'General Consultation'],
  'Rash': ['Dermatology (Skin)', 'General Consultation'],
  'Kushta': ['Dermatology (Skin)', 'General Consultation'],

  // Musculoskeletal
  'Bones': ['Orthopedics (Bones)', 'General Consultation'],
  'Joint Pain': ['Orthopedics (Bones)', 'General Consultation'],
  'Back Pain': ['Orthopedics (Bones)', 'General Consultation'],
  'Sandhivata': ['Orthopedics (Bones)', 'General Consultation'],
  'Asthi': ['Orthopedics (Bones)', 'General Consultation'],

  // Nervous System
  'Nervous': ['Neurology', 'General Consultation'],
  'Headache': ['Neurology', 'General Consultation'],
  'Dizziness': ['Neurology', 'General Consultation'],
  'Vata Disorders': ['Neurology', 'General Consultation'],

  // ENT
  'Ear': ['ENT', 'Karnashoola', 'General Consultation'],
  'Nose': ['ENT', 'General Consultation'],
  'Throat': ['ENT', 'General Consultation'],
  'Karnashoola': ['ENT', 'General Consultation'],

  // General/Fallback
  'General': ['General Consultation'],
  'Fever': ['General Consultation'],
  'Fatigue': ['General Consultation'],
};

/**
 * Gets a list of relevant specialties based on symptoms or diagnostic names.
 * @param {string[]} tags - List of symptoms, treatments, or body systems.
 * @returns {string[]} - Unique list of mapped specialties.
 */
export const getMappedSpecialties = (tags) => {
  if (!tags || !Array.isArray(tags)) return [];
  
  const specialties = new Set();
  tags.forEach(tag => {
    const normalizedTag = tag.trim().toLowerCase();
    
    // Check for direct matches in the map
    Object.keys(SPECIALTY_MAP).forEach(key => {
      if (normalizedTag.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedTag)) {
        SPECIALTY_MAP[key].forEach(specialty => specialties.add(specialty));
      }
    });
  });
  
  return Array.from(specialties);
};
