import {memo} from 'react';

type Props = {profile: {readonly name: string}};

function ProfileName({profile}: Props) {
  return <span data-profile="">{profile.name}</span>;
}

export const MemoProfileName = memo(ProfileName);
