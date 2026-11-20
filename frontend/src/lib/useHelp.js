import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  helpTree,
  searchHelp,
  featuredArticles,
  recentArticles,
  articleNeighbours,
  isStaff,
  loadStaffContent,
  getStaffContent,
  onStaffContent,
  loadStaffIndex,
  getStaffIndex,
} from './help.js';

function useHelpAudience() {
  const { user } = useAuth();
  const staff = useSyncExternalStore(onStaffContent, getStaffContent, getStaffContent);
  const staffReader = isStaff(user);

  useEffect(() => {
    if (staffReader) loadStaffContent();
  }, [staffReader]);

  return {
    staff: staffReader ? staff : undefined,
    pending: staffReader && !staff.loaded,
  };
}

export function useHelpTree() {
  const { staff, pending } = useHelpAudience();
  const tree = useMemo(() => helpTree(staff), [staff]);
  return { ...tree, pending };
}

export function useHelpIndex() {
  const { user } = useAuth();
  const index = useSyncExternalStore(onStaffContent, getStaffIndex, getStaffIndex);
  const staffReader = isStaff(user);

  useEffect(() => {
    if (staffReader) loadStaffIndex();
  }, [staffReader]);

  return useMemo(() => helpTree(staffReader ? index : undefined), [staffReader, index]);
}

export function useHelpSearch(query, limit) {
  const { staff } = useHelpAudience();
  return useMemo(() => searchHelp(query, { limit, staff }), [query, limit, staff]);
}

export function useFeaturedArticles(limit) {
  const { staff } = useHelpAudience();
  return useMemo(() => featuredArticles(limit, staff), [limit, staff]);
}

export function useRecentArticles() {
  const { staff } = useHelpAudience();
  return useMemo(() => recentArticles(staff), [staff]);
}

export function useArticleNeighbours(article) {
  const { staff } = useHelpAudience();
  return useMemo(() => articleNeighbours(article, staff), [article, staff]);
}