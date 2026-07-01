// BroadcastChannel connecting the phone app tab and the /glass HUD tab.
// Messages sent here are received by all OTHER tabs on the same channel name.
// A tab never receives its own messages.
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('sotto_glass')
  : null;

export default channel;
