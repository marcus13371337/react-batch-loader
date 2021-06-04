import { isDefined } from "./utils/isDefined";

export type Loader<T> = (ids: string[]) => Promise<T[]> | T[];
export type IdGetter<T> = (item: T) => string;
export interface ItemState<T> {
  isLoading: boolean;
  isQueued: boolean;
  hasErrors: boolean;
  data: T | null;
}

type ItemCallback<T> = (state: ItemState<T>) => void;

const NEW_ITEM_STATE = {
  isLoading: false,
  isQueued: true,
  hasErrors: false,
  data: null,
};

export interface BatchLoader<T> {
  setLoader: (loader: Loader<T>) => void;
  setDebounce: (debounce: number) => void;
  getItem: (id: string) => ItemState<T>;
  refresh: (id: string) => void;
  refreshAll: () => void;
  subscribe: (id: string, callback: ItemCallback<T>) => () => void;
}

interface Options {
  debounce: number;
  loadWithoutItems: boolean;
  keepCache: boolean;
}

const DEFAULT_OPTIONS: Options = {
  debounce: 0,
  loadWithoutItems: false,
  keepCache: false,
};

type Queue = Array<string | null>;

export const createBatchLoader = <T>(
  getId: IdGetter<T>,
  loader: Loader<T>,
  options: Partial<Options> = DEFAULT_OPTIONS
): BatchLoader<T> => {
  const optionsWithDefaultValues = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let currentLoader = loader;
  let currentQueue: Queue = [];

  const subscriptions: Record<string, Array<ItemCallback<T>>> = {};
  const itemStates: { [key: string]: ItemState<T> } = {};

  let currentTimeout: ReturnType<typeof setTimeout> | null = null;

  const reportQueuing = (id: Queue[0]) => {
    if (id) {
      const callbacks = subscriptions[id];

      itemStates[id] = {
        ...itemStates[id],
        isQueued: true,
      };

      callbacks.forEach((callback) => {
        callback(itemStates[id]);
      });
    }
  };

  const reportLoading = (ids: Queue) => {
    ids.forEach((id) => {
      if (id) {
        const callbacks = subscriptions[id];

        if (callbacks) {
          itemStates[id] = {
            ...itemStates[id],
            hasErrors: false,
            isQueued: false,
            isLoading: true,
          };

          callbacks.forEach((callback) => {
            callback(itemStates[id]);
          });
        }
      }
    });
  };

  const reportFinished = (ids: Queue, items: T[]) => {
    const missingIds: string[] = [];

    ids.forEach((id) => {
      if (id) {
        const item = items.find((item) => getId(item) === id);

        if (!item) {
          missingIds.push(id);
          return;
        }

        const callbacks = subscriptions[id];

        if (callbacks) {
          itemStates[id] = {
            ...itemStates[id],
            hasErrors: false,
            isLoading: false,
            data: item,
          };

          callbacks.forEach((callback) => {
            callback(itemStates[id]);
          });
        }
      }
    });

    reportFailed(missingIds);
  };

  const reportFailed = (ids: Queue) => {
    ids.forEach((id) => {
      if (id) {
        const callbacks = subscriptions[id];

        if (callbacks) {
          itemStates[id] = {
            ...itemStates[id],
            hasErrors: true,
            isLoading: false,
          };

          callbacks.forEach((callback) => {
            callback(itemStates[id]);
          });
        }
      }
    });
  };

  const scheduleLoad = () => {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    currentTimeout = setTimeout(async () => {
      const itemsToFetch = currentQueue;
      currentQueue = [];
      reportLoading(itemsToFetch);
      try {
        const result = await currentLoader(itemsToFetch.filter(isDefined));

        reportFinished(itemsToFetch, result);
      } catch (error) {
        reportFailed(itemsToFetch);
      }

      currentTimeout = null;
    }, optionsWithDefaultValues.debounce);
  };

  const addToQueue = (id: Queue[0]) => {
    currentQueue.push(id);

    reportQueuing(id);
    scheduleLoad();
  };

  if (optionsWithDefaultValues.loadWithoutItems) {
    addToQueue(null);
  }

  return {
    setLoader(newLoader: Loader<T>) {
      currentLoader = newLoader;
    },
    setDebounce(newDebounce: number) {
      optionsWithDefaultValues.debounce = newDebounce;
    },
    getItem(id: string) {
      return itemStates[id] || NEW_ITEM_STATE;
    },
    refreshAll() {
      Object.keys(subscriptions).forEach((id) => addToQueue(id));

      if (optionsWithDefaultValues.loadWithoutItems) {
        addToQueue(null);
      }
    },
    refresh(id: string) {
      addToQueue(id);
    },
    subscribe(id: string, callback: ItemCallback<T>) {
      if (!subscriptions[id]) {
        subscriptions[id] = [];
        itemStates[id] = NEW_ITEM_STATE;
        addToQueue(id);
      }
      subscriptions[id].push(callback);

      return () => {
        subscriptions[id] = subscriptions[id].filter((c) => c !== callback);

        if (!subscriptions[id].length && !optionsWithDefaultValues.keepCache) {
          delete subscriptions[id];
          delete itemStates[id];
        }
      };
    },
  };
};
