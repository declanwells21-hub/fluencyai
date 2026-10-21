// api/_lib/privacy.js
//
// The Privacy Policy tells people that speech and AI providers may not use their data to train their own models and that
// audio is deleted within 24 hours. Deepgram keeps every request and uses it to improve its models UNLESS the request says
// mip_opt_out=true (it then keeps nothing). So the opt-out is ON by default, to match what the policy promises.
//
// Cost: Deepgram's pay-as-you-go and Growth plans give a 50% discount to requests that take part in model improvement,
// so opting out roughly doubles speech-to-text and text-to-speech prices unless you have a contract that says otherwise.
// Set DEEPGRAM_MIP_OPT_OUT=false ONLY if the client decides to accept that trade (and then the Privacy Policy must change).

function mipOptOut() {
  return String(process.env.DEEPGRAM_MIP_OPT_OUT || 'true').toLowerCase() === 'false' ? '' : '&mip_opt_out=true';
}

module.exports = { mipOptOut };
