import './styles.scss';
import * as React from "react";
import {Pane, PaneContent, PaneHeader, PaneTitle} from "../Pane";
import axios from "axios";
import {AllureStatistic, AllureTreeGroup, AllureTreeLeaf, statuses} from "../../interfaces";
import * as bem from "b_";
import SideBySide from "../SideBySide";
import ErrorSplash from "../ErrorSplash";
import Loader from "../Loader";
import {Route} from "react-router";
import TestResult from "../TestResult";
import TestResultTree from "../TestResultTree";
import {DropdownList} from "react-widgets";
import SorterGroup from "../SorterGroup";

const b = bem.with("TestResultTreeContainer");

const Empty: React.SFC = () => (
    <p>No result selected</p>
);

const calculateStatistic = (treeGroup: AllureTreeGroup): AllureTreeGroup => {
    const statistic: AllureStatistic = {};
    if (treeGroup.leafs) {
        treeGroup.leafs.forEach(leaf => {
            const value = statistic[leaf.status] || 0;
            statistic[leaf.status] = value + 1;
        });
    }

    if (treeGroup.groups) {
        treeGroup.groups && treeGroup.groups.forEach(calculateStatistic);
        treeGroup.groups && treeGroup.groups.forEach(group => {
            statuses.forEach(status => {
                const currentValue = statistic[status] || 0;
                const groupValue = group.statistic[status] || 0;
                statistic[status] = currentValue + groupValue;
            });
        });
    }

    treeGroup.statistic = statistic;
    return treeGroup;
};

//SORTING

type Comparator<A> = (a: A, b: A) => number;

interface TreeSorter {
    name: string;
    leafComparator: Comparator<AllureTreeLeaf>;
    groupComparator: Comparator<AllureTreeGroup>;
}

const sorterKeys = ["id", "name", "status"];

const sorters: { [key: string]: TreeSorter } = {
    id: {
        name: "id",
        leafComparator: (a, b) => (a.id - b.id),
        groupComparator: (a, b) => (a.uid.localeCompare(b.uid)),
    },
    name: {
        name: "name",
        leafComparator: (a, b) => (a.name.localeCompare(b.name)),
        groupComparator: (a, b) => (a.name.localeCompare(b.name)),
    },
    status: {
        name: "status",
        leafComparator: (a, b) => (statuses.indexOf(a.status) > statuses.indexOf(b.status) ? -1 : 1),
        groupComparator: (a, b) => {
            return statuses.reduce((all, cur) => {
                return ((a.statistic[cur] !== b.statistic[cur]) && all === 0) ? (a.statistic[cur] || 0) - (b.statistic[cur] || 0) : all;
            }, 0);
        },
    }
};

const withDirection = <T extends {}>(asc: boolean, comparator: Comparator<T>): Comparator<T> => {
    return (a, b) => comparator(a, b) * (asc ? 1 : -1);
};

const sort = (treeRoot: AllureTreeGroup,
              leafComparator: Comparator<AllureTreeLeaf>,
              groupComparator: Comparator<AllureTreeGroup>): AllureTreeGroup => {
    return {
        ...treeRoot,
        groups: treeRoot.groups && treeRoot.groups
            .map(group => sort(group, leafComparator, groupComparator))
            .sort(groupComparator),
        leafs: treeRoot.leafs && treeRoot.leafs.sort(leafComparator)
    };
};

interface TestResultTreeContainerProps {
    route: string;
    name: string;
}

interface TestResultTreeContainerState {
    treeId?: string;
    treeRoot?: AllureTreeGroup;
    error?: Error;
    testResultTab?: string;
}

export default class TestResultTreeContainer extends React.Component<TestResultTreeContainerProps, TestResultTreeContainerState> {
    state: TestResultTreeContainerState = {
        treeId: 'behaviors'
    };

    async componentDidMount() {
        this.loadResult();
    }

    async loadResult() {
        try {
            const {data} = await axios.get(`data/${this.state.treeId}.json`);
            this.setState({treeRoot: calculateStatistic(data), error: undefined});
        } catch (error) {
            this.setState({error});
        }
    }

    onDropdownChange = (value: string) => {
        this.setState({
            treeId: value,
            treeRoot: undefined
        });
        this.loadResult();
    };

    handleSorterChange = (id: string, asc: boolean) => {
        this.setState(prevState => {
            if (!prevState.treeRoot) {
                return prevState;
            }

            const sorter = sorters[id];
            return {
                treeRoot: sort(
                    prevState.treeRoot,
                    withDirection(asc, sorter.leafComparator),
                    withDirection(asc, sorter.groupComparator)
                )
            };
        });
    };

    render() {
        const {treeRoot, error} = this.state;

        if (error) {
            return <ErrorSplash name={error.name} message={error.message} stack={error.stack}/>
        }

        if (!treeRoot) {
            return <Loader/>
        }

        const {name, route} = this.props;

        const leftPane = (
            <Pane>
                <PaneHeader>
                    <PaneTitle>
                        {name}
                    </PaneTitle>
                    <DropdownList defaultValue={this.state.treeId}
                                  data={["suites", "behaviors"]}
                                  onChange={this.onDropdownChange}
                    />
                    <SorterGroup
                        sorters={sorterKeys.map(id => ({id, name: sorters[id].name}))}
                        onSorterChange={this.handleSorterChange}
                    />
                </PaneHeader>
                <PaneContent>
                    <TestResultTree root={treeRoot} route={route}/>
                </PaneContent>
            </Pane>
        );

        const rightPane = (
            <>
                <Route
                    path={`/${route}`}
                    render={() => <Empty/>}
                    exact={true}
                />
                <Route
                    path={`/${route}/:groupId/:testResultId`}
                    render={props => <TestResult
                        id={props.match.params.testResultId}
                        match={props.match}
                    />}
                />
            </>
        );

        return (
            <div className={b()}>
                <SideBySide left={leftPane} right={rightPane}/>
            </div>
        );
    }
}