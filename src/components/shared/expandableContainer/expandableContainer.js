import React from 'react'
import './expandableContainer.scss';

export class ExpandableContainer extends React.Component {
    constructor(props){
        super(props);

        this.state = {
            isExpanded: false
        };
        this.handleNameClick = this.handleNameClick.bind(this);
    }

    toggleExpansion() {
        this.setState({
            isExpanded: !this.state.isExpanded
        })
        if (this.props.onClick) {
            this.props.onClick();
        }
    }

    handleNameClick(event) {
        event.stopPropagation();
    }

    render() {
        return <div className={
                        (this.props.expanded ?? this.state.isExpanded ? 'expanded ' : '')
                        + (this.props.theme === 'light' ? 'light' : 'dark')
                        + ' winnerSection' 
                    } 
                    onClick={() => this.toggleExpansion()}>
                <div className='label'>{this.props.label}</div>

                { (this.props.expanded ?? this.state.isExpanded) &&
                    <div className={
                        'expandableList '
                        + ((this.props.expanded ?? this.state.isExpanded) ? 'expanded' : '')}
                        >

                        {this.props.children}

                    </div>
                }
            </div>
    }
}