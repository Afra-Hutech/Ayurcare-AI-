const { AccessToken } = require('livekit-server-sdk');

function isLiveKitConfigured() {
  return !!(
    process.env.LIVEKIT_URL?.trim()
    && process.env.LIVEKIT_API_KEY?.trim()
    && process.env.LIVEKIT_API_SECRET?.trim()
  );
}

function getLiveKitServerUrl() {
  return process.env.LIVEKIT_URL.trim();
}

function buildLiveKitRoomName(appointmentId) {
  return `docconnect-${String(appointmentId)}`;
}

function buildPatientVideoPath(appointmentId) {
  return `/video/${String(appointmentId)}`;
}

function buildPatientVideoUrl(appointmentId) {
  const base = (process.env.PATIENT_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${buildPatientVideoPath(appointmentId)}`;
}

/**
 * @param {{ roomName: string, identity: string, name?: string, ttlSeconds?: number }}
 */
async function createLiveKitParticipantToken({ roomName, identity, name, ttlSeconds = 7200 }) {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured on the server');
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY.trim(),
    process.env.LIVEKIT_API_SECRET.trim(),
    {
      identity: String(identity),
      name: name ? String(name) : String(identity),
      ttl: ttlSeconds,
    },
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return {
    token,
    serverUrl: getLiveKitServerUrl(),
    roomName,
  };
}

module.exports = {
  isLiveKitConfigured,
  getLiveKitServerUrl,
  buildLiveKitRoomName,
  buildPatientVideoPath,
  buildPatientVideoUrl,
  createLiveKitParticipantToken,
};
