import { CommentProvider, useComments } from './CommentContext';
import { CommentList } from './CommentList';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';

export const Comment = {
  Provider: CommentProvider,
  List: CommentList,
  Composer: CommentComposer,
  Item: CommentItem
};

export { useComments };
export type { CommentData, CommentState, CommentActions } from './CommentContext';
