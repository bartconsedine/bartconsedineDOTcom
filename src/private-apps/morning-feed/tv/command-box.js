export default function TvCommandBox({ paired = false }) {
  return <section className="morning-command" aria-label="Commands to your dot"><div><strong>Talk to your dot</strong><p>{paired ? 'This TV is scoped to Morning signal and news reading progress. ' : ''}Command delivery is not connected yet.</p></div><label className="morning-command-input"><span className="sr-only">Command to your dot</span><input disabled placeholder="Send a command to your dot…" aria-label="Command to your dot"/></label><button disabled type="button">Not connected</button></section>;
}
