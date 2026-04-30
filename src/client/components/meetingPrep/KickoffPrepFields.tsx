/**
 * Kickoff-specific draft fields (meeting URL + when).
 *
 * Future meeting types (discovery, design review) will add their own fields
 * components alongside this one; the `MeetingPrepModal` renders the right one
 * based on `meetingType`. Kept separate so the modal stays generic.
 */

type Props = {
  kickoffWhen: string;
  setKickoffWhen: (v: string) => void;
  kickoffMeetingUrl: string;
  setKickoffMeetingUrl: (v: string) => void;
};

export default function KickoffPrepFields({
  kickoffWhen,
  setKickoffWhen,
  kickoffMeetingUrl,
  setKickoffMeetingUrl,
}: Props) {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Kickoff Meeting When</div>
        <input
          className="ms-input"
          value={kickoffWhen}
          onChange={(e) => setKickoffWhen(e.target.value)}
          placeholder="e.g. January 31, 2026 at 2:00 PM PT"
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Prefilled from the project kickoff date — add time + timezone.</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Kickoff Meeting Details</div>
        <textarea
          className="ms-input"
          rows={3}
          value={kickoffMeetingUrl}
          onChange={(e) => setKickoffMeetingUrl(e.target.value)}
          placeholder="Meeting link, dial-in, access code, or mix — any http/https URLs are auto-linked."
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Saved to the project on send.</div>
      </div>
    </>
  );
}
