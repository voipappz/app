import { useState, useCallback } from 'react';
import { aclsApi } from '../services/api/aclsApi';
import { useACL } from '../components/common/ACLSelect/useACL';

/**
 * Shared hook for editing an ACL from any screen (the same shape as
 * useEnvironmentEdit). Fetches the full ACL, opens ACLDialog in edit mode,
 * saves with PATCH.
 */
const useAclEdit = () => {
  const { types, typesLoading, fetchTypes, typeData, typeDataLoading, fetchTypeData } = useACL();

  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclDialogAcl, setAclDialogAcl] = useState(null);
  const [aclDialogLoading, setAclDialogLoading] = useState(false);
  const [aclSaveError, setAclSaveError] = useState(null);

  const handleAclEdit = useCallback(async (acl) => {
    if (!acl?.uuid) return;
    setAclDialogLoading(true);
    setAclSaveError(null);
    setAclDialogOpen(true);
    try {
      const [fullAcl] = await Promise.all([
        aclsApi.getACL(acl.uuid),
        types.length === 0 ? fetchTypes() : Promise.resolve(),
      ]);
      const data = fullAcl?.data?.uuid ? fullAcl.data : fullAcl;
      setAclDialogAcl(data || acl);
      if (data?.type) await fetchTypeData(data.type);
    } catch (err) {
      console.error('Failed to fetch ACL for edit:', err);
      setAclDialogAcl(acl);
    } finally {
      setAclDialogLoading(false);
    }
  }, [types.length, fetchTypes, fetchTypeData]);

  const handleAclSave = useCallback(async (formData) => {
    if (!aclDialogAcl?.uuid) return;
    setAclDialogLoading(true);
    setAclSaveError(null);
    try {
      await aclsApi.updateACL(aclDialogAcl.uuid, formData);
      setAclDialogOpen(false);
      setAclDialogAcl(null);
    } catch (err) {
      setAclSaveError(err?.message || 'Failed to update ACL');
      throw err;
    } finally {
      setAclDialogLoading(false);
    }
  }, [aclDialogAcl]);

  const handleAclClose = useCallback(() => {
    setAclDialogOpen(false);
    setAclDialogAcl(null);
    setAclSaveError(null);
  }, []);

  return {
    aclDialogOpen,
    aclDialogAcl,
    aclDialogLoading,
    aclSaveError,
    handleAclEdit,
    handleAclSave,
    handleAclClose,
    types,
    typesLoading,
    typeData,
    typeDataLoading,
    handleAclTypeChange: fetchTypeData,
  };
};

export default useAclEdit;
