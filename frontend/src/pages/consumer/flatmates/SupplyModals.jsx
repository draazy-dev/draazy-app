import PostModal from './PostModal.jsx';
import GroupModal from './GroupModal.jsx';

export default function SupplyModals({ s }) {
  const { grp, setGrp } = s;
  return (
    <>
      {s.postOpen && (
        <PostModal setPostOpen={s.setPostOpen} submitPost={s.submitPost} takeDownPost={s.takeDownPost} postFormRef={s.postFormRef} postDraft={s.postDraft} post={s.post} setPost={s.setPost} postErr={s.postErr} editingId={s.editingId} />
      )}

      {s.groupOpen && (
        <GroupModal setGroupOpen={s.setGroupOpen} submitGroup={s.submitGroup} grpFormRef={s.grpFormRef} grpDraft={s.grpDraft} grp={grp} setGrp={setGrp} grpErr={s.grpErr} editing={!!s.editingGroupId} />
      )}

      {s.genderSheet}
    </>
  );
}
