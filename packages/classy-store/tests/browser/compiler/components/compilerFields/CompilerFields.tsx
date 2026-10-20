import {compilerProbe, compilerStore} from '../../compiler.store';

type Props = {text: string; edits: number};

export function CompilerFields({text, edits}: Props) {
  return (
    <section>
      <label>
        Compiled text
        <input
          value={text}
          onChange={(event) => {
            compilerProbe.notifications = 0;
            compilerStore.text = event.target.value;
            compilerStore.edits++;
            compilerProbe.notificationsDuringEvent =
              compilerProbe.notifications;
          }}
        />
      </label>
      <output data-testid="compiled-text">{text}</output>
      <output data-testid="compiled-edits">{edits}</output>
    </section>
  );
}
