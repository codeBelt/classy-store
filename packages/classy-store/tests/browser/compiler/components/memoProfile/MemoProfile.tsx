type Props = {profile: Readonly<{first: string; last: string}>};

export function MemoProfile({profile}: Props) {
  return <output data-testid="memo-profile">{profile.last}</output>;
}
