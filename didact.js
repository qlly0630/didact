/**
 * react element：通过 createElement创建的 react element
 * 真实DOM：最终生成对应的 DOM 节点
 * fiber节点：从 react element 到 真实DOM 的中间产物
 */

/**
 * 创建react element
 * @param type
 * @param props
 * @param children 
 * @returns react element
 */
function createElement(type, props, ...children) {
  // 构建一份标准的数据结构
  return {
    type,
    props: {
      ...props,
      // 对children做处理
      children: children.map(child =>
        typeof child === "object"
          ? child
          // 基本值特殊处理，具体处理逻辑见createTextElement
          : createTextElement(child)
      ),
    },
  }
}

/**
 * 创建react element for 基本值
 * @param text 基本值
 * @returns react element
 */
function createTextElement(text) {
  return {
    // 文本节点的标识
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  }
}

/**
 * 基于fiber节点创建真实DOM
 * @param fiber fiber节点
 * @returns 真实DOM
 */
function createDom(fiber) {
  // 初始真实DOM节点
  const dom =
    // 通过标识来决定创建什么节点
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type)
  // 更新真实DOM
  updateDom(dom, {}, fiber.props)

  return dom
}

// 判断某个prop是否为事件。通过判断prop的key是否用"on"字符串作为开头，来确定这个prop是不是事件
const isEvent = key => key.startsWith("on")
// 判断某个prop是否为常规prop。排除 children这个特殊prop 和 事件，就是常规prop
const isProperty = key =>
  key !== "children" && !isEvent(key)
/**
 * 判断某个prop的value有无更新。用到了函数柯里化
 * 注意：这里包括【无值->有值】和【有旧值->有新值】这2种情况，为什么是这2种情况？看后面的代码会体现
 */
const isNew = (prev, next) => key =>
  prev[key] !== next[key]
// 判定某个prop是否被移除。
const isGone = (prev, next) => key => !(key in next)

/**
 * 更新DOM
 * @param dom 真实DOM
 * @param prevProps 旧props
 * @param nextProps 新props
 */
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  /**
   * 筛选数据：1. 旧props有，但在新props中被移除的事件类型；2. 相同事件类型，但listener不同
   * 目标：解绑事件
   */
  Object.keys(prevProps)
    // 筛选出 事件prop
    .filter(isEvent)
    // 筛选变了的数据
    .filter(
      key =>
        // 新props中已被移除
        !(key in nextProps) ||
        // listener变了
        isNew(prevProps, nextProps)(key)
    )
    .forEach(name => {
      // 获取事件类型，通过转小写和去除前2个字符来获取，如onClick => click
      const eventType = name
        .toLowerCase()
        .substring(2)
      // 解绑事件，https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget/removeEventListener
      dom.removeEventListener(
        eventType,
        // 这里的props[key]都是listener，因为筛选过了
        prevProps[name]
      )
    })

  // Remove old properties
  /**
   * 筛选数据：1. 筛选新props中被【移除】的常规prop，注意是常规prop
   * 目标：操作真实dom去实际移除这些属性
   */
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach(name => {
      dom[name] = ""
    })

  // Set new or changed properties
  /**
   * 筛选数据：1. 筛选新props中被【新增/更新】的常规prop，注意是常规prop
   * 目标：操作真实dom去实际新增/更新这些属性
   */
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      dom[name] = nextProps[name]
    })

  // Add event listeners
  /**
   * 筛选数据：1. 筛选新props中【新增/更新】的事件
   * 目标：操作真实dom去绑定新增的事件，或更新listener
   */
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      // 和 解绑事件 类似
      const eventType = name
        .toLowerCase()
        .substring(2)
      dom.addEventListener(
        eventType,
        nextProps[name]
      )
    })
}

/**
 * 提交到Root，既把整颗树的变更提交（commit）到真实DOM。
 * 注意这个函数的调用时机
 */
function commitRoot() {
  // 遍历需要被删除的节点
  deletions.forEach(commitWork)
  // 执行performUnitOfWork逻辑的时候，就已经生成child了
  commitWork(wipRoot.child)
  // 存一份到currentRoot，用于和下次的新的fiber树作对比，以及复用
  currentRoot = wipRoot
  // wipRoot置空，说明现在已经没有在操作中的fiber树了（都挂到真实DOM了）
  wipRoot = null
}

/**
 * 
 * @param fiber 
 * @returns 
 */
function commitWork(fiber) {
  if (!fiber) {
    // fiber不存在就不停止
    return
  }

  // 获取父fiber节点的真实DOM，如果没有就一层层往上
  let domParentFiber = fiber.parent
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent
  }
  // 获取父fiber节点的真实DOM
  const domParent = domParentFiber.dom

  /**
   * 根据前面添加的effectTag，来实现不同的DOM操作
   */
  if (
    fiber.effectTag === "PLACEMENT" &&
    fiber.dom != null
  ) {
    domParent.appendChild(fiber.dom)
  } else if (
    fiber.effectTag === "UPDATE" &&
    fiber.dom != null
  ) {
    updateDom(
      fiber.dom,
      fiber.alternate.props,
      fiber.props
    )
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent)
  }
  // 继续
  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

/**
 * 删除DOM
 * @param fiber 
 * @param domParent 
 */
function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom)
  } else {
    commitDeletion(fiber.child, domParent)
  }
}

/**
 * render，主入口
 * @param element react element，因为编译时会将 jsx -> createElement，所以就是react element
 * @param container 需要被挂载的真实DOM容器，比如document.getElementById('root')
 */
function render(element, container) {
  /**
   * 初始化一个wipRoot
   * 注意：child是只能通过reconcileChildren去生成，函数组件在传入的时候也只会是element而已
   */
  wipRoot = {
    // 这个是传进来的真实DOM
    dom: container,
    props: {
      // 这个才是要处理的react element
      children: [element],
    },
    alternate: currentRoot,
  }
  // 初始化记录元素删除的数组
  deletions = []
  /**
   * 重要：
   * 把wipRoot设置为下一个任务单元，就能开始执行了。
   * 因为workLoop是一直在循环执行的，workLoop只要发现nextUnitOfWork不为null，就会进入performUnitOfWork开始工作。
   */
  nextUnitOfWork = wipRoot
}

// 下一个任务单元
let nextUnitOfWork = null
// 上次提交到真实DOM的fiber树
let currentRoot = null
// work in progress root
let wipRoot = null
// 初始化记录元素删除的数组
let deletions = null

/**
 * 
 * @param deadline 剩余时间 
 */
function workLoop(deadline) {
  // 暂停标识，true=需要暂停了；false=还有时间可以继续执行
  let shouldYield = false
  // 下一个任务单元 存在 && 当前不需要暂停
  while (nextUnitOfWork && !shouldYield) {
    /**
     * 执行当前任务单元（构建fiber节点），并获取到下一个任务单元，
     * 执行到最上层fiber节点后，会返回null，此时nextUnitOfWork=null，
     * 这意味着已经执行完全部任务单元（遍历完fiber树）
     * 整个流程是就是：找child，有child就用child作为下一个任务单元
     */
    nextUnitOfWork = performUnitOfWork(
      nextUnitOfWork
    )
    // 是否继续执行，剩余时间小于1ms就不继续执行了，等下一次
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextUnitOfWork && wipRoot) {
    // 没有下一个任务单元，并且wipRoot存在，就可以commit到root了
    commitRoot()
  }
  // react实际用的是scheduler
  requestIdleCallback(workLoop)
}

requestIdleCallback(workLoop)

/**
 * 执行任务单元
 * @param fiber 
 * @returns 下一个任务单元
 */
function performUnitOfWork(fiber) {
  // 以type来判断是否为函数组件，所以type不一定是string
  const isFunctionComponent =
    fiber.type instanceof Function
  /**
   * 非常重要的一步，涉及到fiber节点的构建
   */
  if (isFunctionComponent) {
    updateFunctionComponent(fiber)
  } else {
    updateHostComponent(fiber)
  }
  /**
   * 找下一个任务单元，
   * 优先级：child > sibling > uncle（parent.sibling）
   */
  // 判断child
  if (fiber.child) {
    return fiber.child
  }
  /**
   * 判断sibling和uncle，
   * 这里最终会回溯到最上层的fiber节点，最上层的fiber节点没有sibling的时候，就会停止，nextFiber会变成null
   */
  let nextFiber = fiber
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    /**
     * 循环到最后，轮到最上层fiber节点时，没有sibling，也没有parent，nextFiber=null，循环结束
     */
    nextFiber = nextFiber.parent
  }
  // 循环到最后结束的话，因为没有指定return的值，那么就会return undefined
}

let wipFiber = null
let hookIndex = null

/**
 * 处理函数组件
 * @param fiber 
 */
function updateFunctionComponent(fiber) {
  /**
   * 对函数组件要做处理，因为函数本身并不能生成DOM，所以不存在createDom的过程
   * 但需要对其子节点做处理（既return的jsx，如Demo的<h1 ...>xxx</h1>），并挂到最近的有dom的父fiber节点上
   */
  // 处理当前函数组件
  wipFiber = fiber
  // 重置hook当前序号为0，因为是单个函数组件内hook的调用索引
  hookIndex = 0
  // 重置hooks数组，通过序号就能知道是第几个hook，同上
  wipFiber.hooks = []
  // 因为fiber.type是个函数，所以通过fiber.type(fiber.props)来调用这个函数，返回的是react element
  const children = [fiber.type(fiber.props)]
  // 协调
  reconcileChildren(fiber, children)
}

/**
 * 处理普通组件
 * @param  fiber 
 */
function updateHostComponent(fiber) {
  if (!fiber.dom) {
    /**
     * 如果fiber.dom不存在，那么会创建真实DOM，并挂到fiber.dom，并用fiber.dom维护创建的 DOM 节点
     * 注意：此时并没有挂载到document，既没有挂载到render函数的container传入的真实DOM上
     * 注意：如果是在调用render时初始化的wipRoot是本身就有DOM的，就是传进来的container
     */
    fiber.dom = createDom(fiber)
  }
  // 协调
  reconcileChildren(fiber, fiber.props.children)
}

/**
 * 协调，创建新fiber子节点，并把首个子元素生成的新fiber节点挂到wipFiber.child，再把子fiber节点的关系也串在一起。
 * wipFiber -> wipFiber.child -> wipFiber.child.sibling -> wipFiber.child.sibling.sibling
 * 这样，wipFiber和它的子fiber节点就串起来了，同样的，如果子fiber节点也有它的elements，也会执行reconcileChildren方法
 * 所以，只有父fiber节点才能告诉子fiber节点，下一个兄弟节点（sibling）是哪个，父节点（parent）是哪个
 * 这个函数产生的是wipFiber作为为父节点，用它的子元素生成子fiber节点，只有一层的子fiber树
 * @param wipFiber 父fiber节点
 * @param elements 子元素，类型是react element[]，要在这个函数里面转成fiber节点
 */
function reconcileChildren(wipFiber, elements) {
  // 遍历elements用的
  let index = 0
  /**
   * 通过wipFiber.alternate来获取原先存储的旧父fiber节点，
   * 并进一步获取child，因为这个函数处理的是子元素（产物是子节点）
   */
  let oldFiber =
    wipFiber.alternate && wipFiber.alternate.child
  let prevSibling = null

  /**
   * 遍历elements，和wipFiber.alternate.child，
   * 有可能elements比较短，也有可能oldFiber先结束，所以哪个数量多就以哪个为结束标准，
   * 最重要的是，要遍历完全部，无论是新的还是旧的
   */
  while (
    index < elements.length ||
    oldFiber != null
  ) {
    // 当前react element
    const element = elements[index]
    // 新增fiber节点默认为null
    let newFiber = null
    // 判断【旧fiber节点的type】和【新react element的type】是否一样
    const sameType =
      oldFiber &&
      element &&
      element.type == oldFiber.type

    // 如果type是一样的，那么可以复用原先部分数据
    if (sameType) {
      newFiber = {
        // 用【旧fiber节点】的type
        type: oldFiber.type,
        // 拿【新react element】的props来创建新fiber节点
        props: element.props,
        // 复用【旧fiber节点】的DOM，这点很重要
        dom: oldFiber.dom,
        // 常规操作，创建fiber需要有fiber父节点
        parent: wipFiber,
        // 常规操作，存一份旧fiber节点
        alternate: oldFiber,
        // 常规操作，设置effectTag
        // UPDATE：需要更新已经存在的旧 DOM 节点的属性值
        effectTag: "UPDATE",
      }
    }

    /**
     * react element存在，但type不一样，那么就说明需要新增，
     * 因为无论是【无节点->有节点】，还是【旧type->新type】，
     * 都一定要新增真实DOM，因为DOM的基本操作就是这样，如果是【旧type->新type】，那么得删除旧的真实DOM
     */
    if (element && !sameType) {
      newFiber = {
        // 用【新react element】的type和props来设置
        type: element.type,
        props: element.props,
        // 这里只处理fiber节点，所以先不用创建和挂载真实DOM
        dom: null,
        // 常规操作，创建fiber需要有fiber父节点
        parent: wipFiber,
        // 常规操作，因为是新增，所以没有旧fiber节点
        alternate: null,
        // PLACEMENT：需要生成全新的真实DOM
        effectTag: "PLACEMENT",
      }
    }
    
    /**
     * 也就说上面说的【旧type->新type】的情况，得删除掉旧DOM
     * 这里和上面合并起来，会好理解一些，变成：
     * if (!sameType) { 
     *   type发生变化了，有【无节点->有节点】、【旧type->新type】这2种情况。
     *   if (element) { 新增节点 } 
     *   if (oldFiber) { 删除旧节点 }
     * }
     */
    if (oldFiber && !sameType) {
      // 需要被删除的节点就不需要创建fiber节点了，对旧节点做标记
      oldFiber.effectTag = "DELETION"
      /**
       * 但commit的时候，用却的是新生成的fiber树（wipRoot），
       * 所以是遍历不到这个被删除的节点的，所以得另外用数组存起来
       */
      deletions.push(oldFiber)
    }

    if (oldFiber) {
      // 同步遍历旧fiber节点，这个也是整个循环结束的条件之一
      // 注意：oldFiber = wipFiber.alternate.child
      oldFiber = oldFiber.sibling
    }

    // 创建新fiber节点的目的是为了构建fiber树
    if (index === 0) {
      // fiber.child = 首个fiber子节点
      wipFiber.child = newFiber
    } else if (element) {
      // 只要当前react element存在，就把当前新fiber节点，赋值给上次循环产生的新fiber节点的兄弟节点，这样就能串起来
      prevSibling.sibling = newFiber
    }
    // 存储这次产生的新fiber节点，存储这个纯粹是给上面这个逻辑用的
    prevSibling = newFiber
    // 索引+1，继续遍历，直到把elements（所有子元素）都遍历完，注意：遍历完elements，不代表循环结束，有可能oldFiber还有兄弟节点没遍历完
    index++
  }
}

function useState(initial) {
  // 获取原先存储的hook
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex]
  // 初始化hook
  const hook = {
    // 有旧hook就把旧hook的值拷贝一份到新hook，没有就用传入初始值
    state: oldHook ? oldHook.state : initial,
    queue: [],
  }
  /**
   * 获取在执行setState时存储的action，
   * 注意：actions都是原先存储的，消耗完原先存储的actions，产生新数据去构建新的fiber树
   */
  const actions = oldHook ? oldHook.queue : []
  // 遍历获取到的actions
  actions.forEach(action => {
    // 消耗完actions，产生的新state需要存起来，作为下次初始化的值
    hook.state = action(hook.state)
  })

  const setState = action => {
    /**
     * 把action存起来是为了在后续构建新fiber节点时才执行，
     * 如果有多次调用setState，都会存在queue数组内
     */
    hook.queue.push(action)
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    }
    // 重要：执行setState需要设置nextUnitOfWork
    nextUnitOfWork = wipRoot
    deletions = []
  }
  // 对当前函数组件的hook增加一个hook
  wipFiber.hooks.push(hook)
  // 多次调用useState时，通过索引来区别
  hookIndex++
  return [hook.state, setState]
}


// 以下为Demo

const Didact = {
  createElement,
  render,
  useState,
}

/** @jsx Didact.createElement */
function Counter() {
  const [state, setState] = Didact.useState(1)
  return (
    <h1 onClick={() => setState(c => c + 1)}>
      Count: {state}
    </h1>
  )
}
const element = <Counter />
const container = document.getElementById("root")
Didact.render(element, container)
