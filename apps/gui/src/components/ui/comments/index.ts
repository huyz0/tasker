import { CommentProvider } from './CommentContext';
import { CommentList } from './CommentList';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';

export const Comment = {
  Provider: CommentProvider,
  List: CommentList,
  Composer: CommentComposer,
  Item: CommentItem
};
