/** Construct a genuine pre-v11 document, without fields those versions never wrote. */
export function legacyFixture<T>(p:T):T{const value=structuredClone(p) as any;delete value.masterAudio;delete value.trackLayout;for(const c of value.clips??[])delete c.audioRoute;return value;}
