export function Banner({ model }: { model: string }) {
  return (
    <div className="glass banner">
      {model === 'replay'
        ? (<><b>Replay model. </b>The data below is produced by the real pipeline and checks from hand-authored model outputs. It demonstrates orchestration and checks, not extraction quality. Fictional clients and people.</>)
        : (<><b>Live model ({model}). </b>The data below was read by an AI model; every quote was checked against the original and every change waits for approval. Fictional clients and people.</>)}
    </div>
  );
}
