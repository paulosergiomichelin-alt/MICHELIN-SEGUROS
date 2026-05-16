
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePermissions } from '../../contexts/PermissionsContext';
import { UserProfileModal } from '../../components/UserProfileModal';

export const UserProfilePage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { userProfile } = usePermissions();

  return (
    <UserProfileModal
      mode="edit"
      targetUserId={uid}
      user={userProfile}
      profile={userProfile}
      onClose={() => navigate('/users')}
    />
  );
};
