import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IdGetter,
  BatchLoader,
  createBatchLoader,
  Loader,
  ItemState,
} from "./createBatchLoader";

const noLoadingFunctionError = () => {
  throw new Error("No loading function provided");
};

export const createBatchLoaderContext = <T,>(
  idGetter: IdGetter<T>,
  load?: Loader<T>
) => {
  const Context = createContext<BatchLoader<T>>(
    createBatchLoader(idGetter, load || noLoadingFunctionError)
  );

  const Provider: React.FC<{
    debounce?: number;
    keepCache?: boolean;
    loadWithoutItems?: boolean;
    loadItems: Loader<T>;
  }> = ({ debounce, keepCache, loadItems, loadWithoutItems, children }) => {
    const batchLoader = useRef<BatchLoader<T> | null>(null);

    if (!batchLoader.current) {
      batchLoader.current = createBatchLoader(idGetter, loadItems, {
        debounce,
        keepCache,
        loadWithoutItems,
      });
    }

    useEffect(() => {
      batchLoader.current?.setDebounce(debounce || 0);
    }, [debounce]);

    useEffect(() => {
      batchLoader.current?.setLoader(loadItems);
    }, [loadItems]);

    return (
      <Context.Provider value={batchLoader.current}>
        {children}
      </Context.Provider>
    );
  };

  const useBatchLoader = () => useContext(Context);

  const useItem = (id: string): ItemState<T> & { refresh: () => void } => {
    const { subscribe, refresh, getItem } = useContext(Context);
    const [state, setState] = useState<ItemState<T>>(() => getItem(id));

    useEffect(
      () => subscribe(id, (newState) => setState(newState)),
      [subscribe, id]
    );

    const refreshThisItem = useCallback(() => {
      refresh(id);
    }, [refresh, id]);

    return useMemo(
      () => ({ ...state, refresh: refreshThisItem }),
      [state, refreshThisItem]
    );
  };

  return {
    Provider,
    useItem,
    useBatchLoader,
  };
};
