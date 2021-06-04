import { BatchLoader, createBatchLoader } from "./createBatchLoader";

const resolveAfter = <T>(items: T, delay: number): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(items), delay);
  });

jest.useFakeTimers();

interface MockedItem {
  id: string;
}

const MOCKED_ITEM: MockedItem = {
  id: "1",
};
const MOCKED_ITEM2: MockedItem = {
  id: "2",
};

const EMPTY_STATE = {
  isLoading: false,
  isQueued: true,
  hasErrors: false,
  data: null,
};

const forwardTime = async (time: number) => {
  jest.advanceTimersByTime(time);

  await Promise.resolve();
};

describe("createBatchLoader", () => {
  const loadItems = jest.fn(() =>
    resolveAfter([MOCKED_ITEM, MOCKED_ITEM2], 100)
  );

  let batchLoader: BatchLoader<MockedItem>;

  beforeEach(() => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      debounce: 100,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("doesnt do anything if nothing subscribes", async () => {
    expect(loadItems).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(200);

    expect(loadItems).toHaveBeenCalledTimes(0);
  });

  it("defaults to an empty state even if no subscription has been made", async () => {
    expect(batchLoader.getItem("1")).toEqual({
      isLoading: false,
      isQueued: true,
      hasErrors: false,
      data: null,
    });
  });

  it("waits for the debounce delay and then fetches data", async () => {
    expect(batchLoader.getItem("1")).toEqual(EMPTY_STATE);

    const updateFunction = jest.fn();
    batchLoader.subscribe("1", updateFunction);

    expect(updateFunction).toHaveBeenCalledTimes(0);
    expect(loadItems).toHaveBeenCalledTimes(0);

    // Wait for other subscriptions
    await forwardTime(50);

    expect(updateFunction).toHaveBeenCalledTimes(0);
    expect(loadItems).toHaveBeenCalledTimes(0);

    // Send request
    await forwardTime(100);

    expect(updateFunction).toHaveBeenCalledTimes(1);
    expect(updateFunction).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isQueued: false,
      isLoading: true,
    });
    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith(["1"]);

    // Resolve request
    await forwardTime(100);

    expect(updateFunction).toHaveBeenCalledTimes(2);
    expect(updateFunction).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isQueued: false,
      isLoading: false,
      data: MOCKED_ITEM,
    });
    expect(loadItems).toHaveBeenCalledTimes(1);
  });

  it("removes any leftover data if unsubscribed without keepCache", async () => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      keepCache: false,
      debounce: 100,
    });

    expect(batchLoader.getItem("1")).toEqual(EMPTY_STATE);

    const updateFunction = jest.fn();
    const unsubscribe = batchLoader.subscribe("1", updateFunction);

    await forwardTime(200);

    const LOADED_STATE = {
      ...EMPTY_STATE,
      isQueued: false,
      isLoading: false,
      data: MOCKED_ITEM,
    };

    expect(updateFunction).toHaveBeenCalledTimes(2);
    expect(updateFunction).toHaveBeenLastCalledWith(LOADED_STATE);

    expect(batchLoader.getItem("1")).toEqual(LOADED_STATE);

    unsubscribe();

    expect(batchLoader.getItem("1")).toEqual(EMPTY_STATE);
  });

  it("removes keeps leftover data if unsubscribed with keepCache", async () => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      keepCache: true,
      debounce: 100,
    });

    expect(batchLoader.getItem("1")).toEqual(EMPTY_STATE);

    const updateFunction = jest.fn();
    const unsubscribe = batchLoader.subscribe("1", updateFunction);

    await forwardTime(200);

    const LOADED_STATE = {
      ...EMPTY_STATE,
      isQueued: false,
      isLoading: false,
      data: MOCKED_ITEM,
    };

    expect(updateFunction).toHaveBeenCalledTimes(2);
    expect(updateFunction).toHaveBeenLastCalledWith(LOADED_STATE);

    expect(batchLoader.getItem("1")).toEqual(LOADED_STATE);

    unsubscribe();

    expect(batchLoader.getItem("1")).toEqual(LOADED_STATE);
  });

  it("batches up multiple subscriptions", async () => {
    const updateFunction1 = jest.fn();
    const updateFunction2 = jest.fn();

    batchLoader.subscribe("1", updateFunction1);

    await forwardTime(95);

    expect(loadItems).not.toHaveBeenCalled();
    batchLoader.subscribe("2", updateFunction2);

    await forwardTime(99);
    expect(loadItems).not.toHaveBeenCalled();

    await forwardTime(1);
    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith(["1", "2"]);

    await forwardTime(100);

    expect(updateFunction1).toHaveBeenCalledTimes(2);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(2);
    expect(updateFunction2).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM2,
    });

    batchLoader.refresh("1");
    expect(updateFunction1).toHaveBeenCalledTimes(3);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: true,
      hasErrors: false,
      data: MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(2);

    await forwardTime(100);
    expect(loadItems).toHaveBeenCalledTimes(2);
    expect(loadItems).toHaveBeenLastCalledWith(["1"]);

    expect(updateFunction1).toHaveBeenCalledTimes(4);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: true,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM,
    });

    await forwardTime(100);

    expect(updateFunction1).toHaveBeenCalledTimes(5);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(2);

    batchLoader.refreshAll();

    expect(updateFunction1).toHaveBeenCalledTimes(6);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: true,
      hasErrors: false,
      data: MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(3);
    expect(updateFunction2).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: true,
      hasErrors: false,
      data: MOCKED_ITEM2,
    });

    const NEW_MOCKED_ITEM = {
      ...MOCKED_ITEM,
      newAttribute: "xxx",
    };
    const NEW_MOCKED_ITEM2 = {
      ...MOCKED_ITEM2,
      newAttribute: "xxx",
    };
    loadItems.mockImplementationOnce(() =>
      resolveAfter([NEW_MOCKED_ITEM, NEW_MOCKED_ITEM2], 100)
    );

    await forwardTime(100);
    expect(loadItems).toHaveBeenCalledTimes(3);
    expect(loadItems).toHaveBeenLastCalledWith(["1", "2"]);
    expect(updateFunction1).toHaveBeenCalledTimes(7);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: true,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(4);
    expect(updateFunction2).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: true,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM2,
    });

    await forwardTime(100);
    expect(updateFunction1).toHaveBeenCalledTimes(8);
    expect(updateFunction1).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: NEW_MOCKED_ITEM,
    });
    expect(updateFunction2).toHaveBeenCalledTimes(5);
    expect(updateFunction2).toHaveBeenLastCalledWith({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: NEW_MOCKED_ITEM2,
    });
  });

  it("keeps the data if two subscribers with keepCache false", async () => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      debounce: 100,
      keepCache: false,
    });

    const updateFunction1 = jest.fn();
    const updateFunction2 = jest.fn();

    const unsubscribe1 = batchLoader.subscribe("1", updateFunction1);
    const unsubscribe2 = batchLoader.subscribe("1", updateFunction2);

    await forwardTime(200);

    unsubscribe1();

    expect(batchLoader.getItem("1")).toEqual({
      ...EMPTY_STATE,
      isLoading: false,
      isQueued: false,
      hasErrors: false,
      data: MOCKED_ITEM,
    });

    const updateFunction3 = jest.fn();
    const unsubscribe3 = batchLoader.subscribe("1", updateFunction3);

    await forwardTime(200);
    expect(updateFunction3).not.toHaveBeenCalled();

    unsubscribe2();
    unsubscribe3();

    expect(batchLoader.getItem("1")).toEqual(EMPTY_STATE);
  });

  it("sends a request even if no subscribers with loadWithoutItems set to true", async () => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      debounce: 100,
      loadWithoutItems: true,
    });

    expect(loadItems).toHaveBeenCalledTimes(0);

    await forwardTime(100);

    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith([]);

    batchLoader.refreshAll();

    await forwardTime(100);

    expect(loadItems).toHaveBeenCalledTimes(2);
    expect(loadItems).toHaveBeenCalledWith([]);
  });

  it("doesnt crash if unsubscribed before fetching data", async () => {
    batchLoader = createBatchLoader<MockedItem>((item) => item.id, loadItems, {
      debounce: 100,
    });

    expect(loadItems).toHaveBeenCalledTimes(0);

    const updateFunction = jest.fn();

    const unsubscribe = batchLoader.subscribe("1", updateFunction);

    await forwardTime(50);

    unsubscribe();

    await forwardTime(50);

    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith(["1"]);
    expect(updateFunction).toHaveBeenCalledTimes(0);
  });
});
