import React from 'react'
import './expandableContainerList.scss';


export class ExpandableContainerList extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            expandedItem: null
        };

        this.handleExpansionClick = this.handleExpansionClick.bind(this);
    }

    handleExpansionClick(event) {
        if (this.state.expandedItem === event) {
            this.setState({
                expandedItem: null
            })
        } else {
            this.setState({
                expandedItem: event
            })
        }
    }


    render() {
        return  <div>
                    {
                        React.Children.map(this.props.children, (child, i) => {
                            if (!child) {
                                return null;
                            }

                            const props = {...child?.props};
                            props.theme = this.props?.theme;
                            props.onClick = () => this.handleExpansionClick(i);
                            props.expanded = this.state.expandedItem === i;
                            return React.cloneElement(child, props)
                        })
                    }
                </div>

    }
}